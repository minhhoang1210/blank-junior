import { randomUUID } from "node:crypto";
import JSZip from "jszip";
import { renderCover } from "./cover.js";
import { escapeXml, toXhtmlFragment, xhtmlDocument } from "./dom.js";
import { type EmbedBudget, embedImages, type EmbeddedImage } from "./images.js";
import { buildNavBody, buildNcx, buildOpf, CONTAINER_XML, EPUB_CSS, type NavPoint } from "./templates.js";
import type { BuildHooks, Chapter, ImageFetcher, StoryMeta } from "./types.js";

export interface EpubOptions extends BuildHooks {
  /** When provided, remote `<img>` sources are downloaded and embedded. */
  fetchImage?: ImageFetcher;
  imageBudget?: EmbedBudget;
}

/** Accumulates the three parallel lists an EPUB package needs. */
class PackageBuilder {
  readonly manifest: string[] = [];
  readonly spine: string[] = [];
  readonly navPoints: NavPoint[] = [];

  /** Registers a content document: manifest entry, reading order and TOC entry. */
  addDocument(id: string, href: string, title: string): void {
    this.manifest.push(`<item id="${id}" href="${href}" media-type="application/xhtml+xml"/>`);
    this.spine.push(`<itemref idref="${id}"/>`);
    this.navPoints.push({ href, title });
  }

  addManifestItem(entry: string): void {
    this.manifest.push(entry);
  }
}

/** Builds a valid EPUB 3 package (with an EPUB 2 NCX for older readers). */
export async function buildEpub(
  meta: StoryMeta,
  chapters: Chapter[],
  options: EpubOptions = {},
): Promise<Uint8Array> {
  const zip = new JSZip();
  const uuid = `urn:uuid:${randomUUID()}`;
  const modified = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

  // The mimetype entry must come first and be stored uncompressed.
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file("META-INF/container.xml", CONTAINER_XML);

  const oebps = zip.folder("OEBPS");
  if (!oebps) throw new Error("Không tạo được thư mục OEBPS trong tệp EPUB.");
  oebps.file("style.css", EPUB_CSS);

  const pkg = new PackageBuilder();
  const images: EmbeddedImage[] = [];

  // Both the synopsis and every chapter body go through the same embedding step,
  // otherwise their illustrations stay as remote URLs and break offline.
  const budget = options.imageBudget;
  const embed = (html: string) =>
    options.fetchImage && budget
      ? embedImages(html, images, options.fetchImage, budget, options)
      : Promise.resolve(html);

  // ---- Cover ----------------------------------------------------------------
  const cover = renderCover(meta.title, meta.author);
  oebps.file("images/cover.svg", cover);
  pkg.addManifestItem(
    '<item id="cover-image" href="images/cover.svg" media-type="image/svg+xml" properties="cover-image"/>',
  );
  oebps.file(
    "cover.xhtml",
    xhtmlDocument(
      "Bìa",
      `    <div class="cover"><img src="images/cover.svg" alt="${escapeXml(meta.title)}" /></div>`,
      meta.language,
    ),
  );
  pkg.addManifestItem('<item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>');
  pkg.spine.push('<itemref idref="cover" linear="no"/>');

  // ---- Title / synopsis page ------------------------------------------------
  options.onStatus?.("Đang dựng trang tiêu đề…");
  const synopsis = meta.descriptionHtml ? await embed(toXhtmlFragment(meta.descriptionHtml)) : "";

  const titleBody = [
    `    <h1>${escapeXml(meta.title)}</h1>`,
    meta.author ? `    <p class="meta">${escapeXml(meta.author)}</p>` : "",
    synopsis,
    `    <p class="source">Nguồn: <a href="${escapeXml(meta.sourceUrl)}">${escapeXml(meta.sourceUrl)}</a></p>`,
  ]
    .filter(Boolean)
    .join("\n");

  oebps.file("title.xhtml", xhtmlDocument(meta.title, titleBody, meta.language));
  pkg.addDocument("titlepage", "title.xhtml", meta.title);

  // ---- Chapters -------------------------------------------------------------
  for (const [index, chapter] of chapters.entries()) {
    const id = `chapter-${String(index + 1).padStart(4, "0")}`;
    const href = `${id}.xhtml`;
    const title = chapter.title || chapter.linkText || `Chương ${index + 1}`;

    const body = await embed(toXhtmlFragment(chapter.html ?? ""));
    oebps.file(
      href,
      xhtmlDocument(title, `    <h1>${escapeXml(title)}</h1>\n${body}`, meta.language),
    );
    pkg.addDocument(id, href, title);

    options.onStatus?.(`Đang đóng gói ${index + 1}/${chapters.length}…`);
  }

  for (const image of images) {
    oebps.file(image.path, image.data);
    pkg.addManifestItem(
      `<item id="${image.id}" href="${image.path}" media-type="${escapeXml(image.mimeType)}"/>`,
    );
  }

  // ---- Navigation -----------------------------------------------------------
  oebps.file("nav.xhtml", xhtmlDocument("Mục lục", buildNavBody(pkg.navPoints), meta.language));
  pkg.addManifestItem(
    '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
  );

  oebps.file("toc.ncx", buildNcx(uuid, meta, pkg.navPoints));
  pkg.addManifestItem('<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>');

  oebps.file(
    "content.opf",
    buildOpf({
      meta,
      uuid,
      modified,
      manifest: pkg.manifest,
      spine: pkg.spine,
      hasCover: true,
    }),
  );

  options.onStatus?.("Đang nén tệp EPUB…");
  return zip.generateAsync({
    type: "uint8array",
    mimeType: "application/epub+zip",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
}
