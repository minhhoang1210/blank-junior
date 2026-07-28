import { type DomDocument, type DomElement, parseFragment, parseHtml } from "./dom.js";
import { collapseWhitespace, normalize } from "./text.js";
import type { Chapter, StoryMeta } from "./types.js";

/**
 * A link is treated as a chapter when its href or anchor text contains one of
 * these markers. Both sides are compared with diacritics stripped, so
 * "Chương 12", "chuong-12", "Phiên ngoại 3" and "phien-ngoai-3" all match.
 */
const CHAPTER_KEYWORDS = ["chuong", "chap", "chapter", "phien-ngoai", "ngoai-truyen", "vi-thanh"];

/**
 * Each keyword in both spellings: URL slugs join words with hyphens
 * ("phien-ngoai-3"), while anchor text separates them with spaces
 * ("Phiên ngoại 3"). Precomputed so matching stays a plain substring test.
 */
const KEYWORD_VARIANTS = [
  ...new Set(CHAPTER_KEYWORDS.flatMap((keyword) => [keyword, keyword.split("-").join(" ")])),
];

/** Elements that are chrome rather than story content on a WordPress post. */
const JUNK_SELECTORS = [
  "script",
  "style",
  "noscript",
  "iframe",
  "form",
  "button",
  "svg",
  "link",
  "meta",
  "nav",
  "footer",
  "header.entry-header",
  ".entry-meta",
  ".entry-footer",
  ".post-navigation",
  ".nav-links",
  ".navigation",
  ".sharedaddy",
  ".sd-block",
  ".sd-sharing",
  ".sd-social",
  ".jp-relatedposts",
  "#jp-post-flair",
  ".jp-relatedposts-headline",
  ".wpcnt",
  ".wpa",
  ".comments-area",
  "#comments",
  "#respond",
  ".comment-respond",
  ".pd-rating",
  ".wp-polls",
  ".sharing-hidden",
  ".reblog-post",
  ".crayon-toolbar",
];

/** Attributes kept when sanitising; everything else is dropped. */
const ALLOWED_ATTRS: Record<string, string[]> = {
  a: ["href", "title"],
  img: ["src", "alt", "width", "height"],
  ol: ["start"],
  td: ["colspan", "rowspan"],
  th: ["colspan", "rowspan"],
};

/** Containers to look for, most specific first, when locating the story text. */
const CONTENT_SELECTORS = [
  "article .entry-content",
  "article",
  ".entry-content",
  ".post-content",
  "main",
  "#content",
];

const TITLE_SELECTORS = ["h1.entry-title", ".entry-title", "article h1", "h1", "title"];

/** Finds the page's main content container, preferring the semantic `<article>`. */
export function findArticle(doc: DomDocument): DomElement | null {
  for (const selector of CONTENT_SELECTORS) {
    const found = doc.querySelector(selector);
    if (found?.textContent?.trim()) return found;
  }
  return doc.body?.textContent?.trim() ? doc.body : doc.documentElement;
}

export function extractTitle(doc: DomDocument): string {
  for (const selector of TITLE_SELECTORS) {
    const text = doc.querySelector(selector)?.textContent?.trim();
    if (text) return collapseWhitespace(text);
  }
  return "Untitled";
}

/** Returns an empty string when the page names no author; callers omit the field. */
export function extractAuthor(doc: DomDocument): string {
  const meta =
    doc.querySelector('meta[name="author"]')?.getAttribute("content") ??
    doc.querySelector('meta[property="article:author"]')?.getAttribute("content") ??
    doc.querySelector('.author .fn, .byline .author, a[rel="author"]')?.textContent;
  return collapseWhitespace(meta ?? "");
}

export function extractLanguage(doc: DomDocument): string {
  const lang = doc.documentElement.getAttribute("lang");
  return lang ? (lang.split("-")[0] ?? "en") : "en";
}

/**
 * Rewrites relative hrefs/srcs to absolute, strips junk nodes and unknown
 * attributes. Returns a detached clone — the source document is left untouched.
 */
export function cleanContent(
  source: DomElement,
  baseUrl: string,
  options: { stripImages: boolean; stripLinks: boolean },
): DomElement {
  const root = source.cloneNode(true);

  for (const selector of JUNK_SELECTORS) {
    for (const node of Array.from(root.querySelectorAll(selector))) node.remove();
  }

  // Resolve URLs before anything is unwrapped, while the elements still exist.
  for (const anchor of Array.from(root.querySelectorAll("a[href]"))) {
    const resolved = resolveUrl(anchor.getAttribute("href"), baseUrl);
    if (resolved) anchor.setAttribute("href", resolved);
    else anchor.removeAttribute("href");
  }

  for (const img of Array.from(root.querySelectorAll("img"))) {
    // WordPress lazy-loads via data-src / data-orig-file; prefer those over a placeholder.
    const candidate =
      img.getAttribute("data-orig-file") ??
      img.getAttribute("data-large-file") ??
      img.getAttribute("data-src") ??
      img.getAttribute("src");
    const resolved = resolveUrl(candidate, baseUrl);
    if (resolved) img.setAttribute("src", resolved);
    else img.remove();
  }

  if (options.stripImages) {
    for (const node of Array.from(root.querySelectorAll("img, figure, picture"))) node.remove();
  }

  if (options.stripLinks) {
    for (const anchor of Array.from(root.querySelectorAll("a"))) {
      anchor.replaceWith(...Array.from(anchor.childNodes));
    }
  }

  stripAttributes(root);
  removeEmptyBlocks(root);

  return root;
}

function stripAttributes(root: DomElement): void {
  const walk = (element: DomElement) => {
    const allowed = ALLOWED_ATTRS[element.tagName.toLowerCase()] ?? [];
    for (const attribute of Array.from(element.attributes)) {
      if (!allowed.includes(attribute.name)) element.removeAttribute(attribute.name);
    }
    Array.from(element.children).forEach(walk);
  };

  Array.from(root.children).forEach(walk);
  for (const attribute of Array.from(root.attributes)) root.removeAttribute(attribute.name);
}

/** Drops paragraphs/divs that hold neither text nor media, a common WP artifact. */
function removeEmptyBlocks(root: DomElement): void {
  for (const node of Array.from(root.querySelectorAll("p, div, span, section"))) {
    const hasText = (node.textContent ?? "").replace(/ /g, " ").trim();
    const hasMedia = (node as DomElement).querySelector("img, br, hr, table");
    if (!hasText && !hasMedia) node.remove();
  }
}

export function resolveUrl(href: string | null | undefined, baseUrl: string): string | null {
  const trimmed = href?.trim();
  if (!trimmed || trimmed.startsWith("#") || /^(javascript|mailto|tel):/i.test(trimmed)) {
    return null;
  }

  try {
    const url = new URL(trimmed, baseUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

export function isChapterLink(url: string, text: string): boolean {
  const haystack = `${normalize(safeDecode(url))} ${normalize(text)}`;
  return KEYWORD_VARIANTS.some((keyword) => haystack.includes(keyword));
}

/** decodeURIComponent throws on malformed escapes, which a stray href can contain. */
function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Collects chapter links from the index page's article, deduplicated by URL and
 * restricted to the index page's own host.
 *
 * Document order *is* the reading order, and it is not second-guessed. Sorting
 * by the number in the link looks tempting and is wrong: side stories restart
 * their own numbering, so "Phiên ngoại 1" sorts against "Chương 1" and the
 * extras end up shuffled through the main story instead of sitting after it.
 * The page already lists chapters in the order they should be read.
 */
export function extractChapterLinks(article: DomElement, baseUrl: string): Chapter[] {
  const origin = safeOrigin(baseUrl);
  const seen = new Set<string>();
  const chapters: Chapter[] = [];

  for (const anchor of Array.from(article.querySelectorAll("a[href]"))) {
    const url = resolveUrl(anchor.getAttribute("href"), baseUrl);
    if (!url || seen.has(url)) continue;

    const linkText = collapseWhitespace(anchor.textContent ?? "");
    if (!isChapterLink(url, linkText)) continue;
    if (origin && safeOrigin(url) !== origin) continue;
    // The index page often links back to itself from a "table of contents" anchor.
    if (stripTrailingSlash(url) === stripTrailingSlash(baseUrl)) continue;

    seen.add(url);
    chapters.push({ url, linkText: linkText || url });
  }

  return chapters;
}

function safeOrigin(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

export function countWords(html: string): number {
  return (parseFragment(html).textContent ?? "").trim().match(/\S+/g)?.length ?? 0;
}

/** Parses the index page into story metadata plus its sorted chapter links. */
export function parseIndexPage(
  html: string,
  finalUrl: string,
  options: { stripImages: boolean },
): { meta: StoryMeta; chapters: Chapter[] } {
  const doc = parseHtml(html);
  const article = findArticle(doc);
  if (!article) throw new Error("Không tìm thấy phần nội dung trên trang mục lục.");

  const chapters = extractChapterLinks(article, finalUrl);

  // The synopsis is the article with the chapter links removed, so the exported
  // description page isn't just a wall of dead links.
  const description = cleanContent(article, finalUrl, {
    stripImages: options.stripImages,
    stripLinks: true,
  });
  for (const node of Array.from(description.querySelectorAll("li, p"))) {
    const text = collapseWhitespace(node.textContent ?? "");
    if (text && text.length < 120 && isChapterLink("", text)) node.remove();
  }
  removeEmptyBlocks(description);

  return {
    meta: {
      title: extractTitle(doc),
      author: extractAuthor(doc),
      language: extractLanguage(doc),
      descriptionHtml: description.innerHTML,
      sourceUrl: finalUrl,
    },
    chapters,
  };
}

/** Parses a chapter page into its title and cleaned body HTML. */
export function parseChapterPage(
  html: string,
  finalUrl: string,
  options: { stripImages: boolean },
): { title: string; html: string } {
  const doc = parseHtml(html);
  const article = findArticle(doc);
  if (!article) throw new Error("Không tìm thấy phần nội dung của chương.");

  const cleaned = cleanContent(article, finalUrl, {
    stripImages: options.stripImages,
    stripLinks: true,
  });
  const body = cleaned.innerHTML.trim();
  if (!body) throw new Error("Nội dung chương rỗng sau khi làm sạch.");

  return { title: extractTitle(doc), html: body };
}
