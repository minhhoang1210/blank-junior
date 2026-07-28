import { EpubError } from "./errors.js";
import { fetchPage } from "./fetcher.js";
import { countWords, parseChapterPage, parseIndexPage } from "./parser.js";
import type { Chapter, StoryMeta } from "./types.js";

export interface ScrapeOptions {
  /** Parallel chapter fetches. */
  concurrency: number;
  /** Pause after each completed fetch, to stay polite to the source server. */
  delayMs: number;
  /** Attempts per page before giving up on it. */
  retries: number;
  /** Hard ceiling on how many chapters are downloaded. */
  maxChapters: number;
  /** `Date.now()` value after which no new chapter is started. */
  deadline: number;
  stripImages: boolean;
  onProgress?: (done: number, total: number) => void;
}

export interface ScrapedStory {
  meta: StoryMeta;
  /** Chapters that came back with content, in reading order. */
  chapters: Chapter[];
  /** Chapter links found on the index page, before any cap was applied. */
  discovered: number;
  /** How many we actually attempted. */
  attempted: number;
  failed: number;
  /** True when the cap or the time budget cut the download short. */
  truncated: boolean;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Reads the index page, then downloads every chapter it links to.
 *
 * A page with no chapter links is not an error: plenty of one-shots are a single
 * WordPress post, so that page becomes the book's only chapter.
 */
export async function scrapeStory(url: string, options: ScrapeOptions): Promise<ScrapedStory> {
  const index = await fetchIndex(url, options);
  const { meta, chapters: links } = parseIndexPage(index.html, index.finalUrl, options);

  if (links.length === 0) {
    return singlePageStory(meta, index.html, index.finalUrl, options);
  }

  const queue = links.slice(0, options.maxChapters);
  const fetched = new Array<Chapter | undefined>(queue.length);
  let done = 0;
  let failed = 0;
  let outOfTime = false;

  options.onProgress?.(0, queue.length);

  const worker = async (next: () => number) => {
    for (let index = next(); index < queue.length; index = next()) {
      const chapter = queue[index];
      if (!chapter) continue;

      if (Date.now() > options.deadline) {
        outOfTime = true;
        return;
      }

      try {
        const page = await fetchPage(chapter.url, { retries: options.retries });
        const parsed = parseChapterPage(page.html, page.finalUrl, options);
        fetched[index] = {
          ...chapter,
          title: parsed.title,
          html: parsed.html,
          wordCount: countWords(parsed.html),
        };
      } catch {
        // One unreachable chapter must not sink the book; it is counted and the
        // reply says how many were lost.
        failed++;
      }

      options.onProgress?.(++done, queue.length);
      if (options.delayMs > 0) await sleep(options.delayMs);
    }
  };

  let cursor = 0;
  const next = () => cursor++;
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(options.concurrency, queue.length)) }, () =>
      worker(next),
    ),
  );

  const chapters = fetched.filter((chapter): chapter is Chapter => chapter !== undefined);
  if (chapters.length === 0) {
    throw new EpubError(
      "Không tải được chương nào — trang nguồn có thể đang chặn hoặc đã đổi cấu trúc.",
    );
  }

  return {
    meta,
    chapters,
    discovered: links.length,
    attempted: queue.length,
    failed,
    truncated: outOfTime || links.length > queue.length,
  };
}

async function fetchIndex(url: string, options: ScrapeOptions) {
  try {
    return await fetchPage(url, { retries: options.retries });
  } catch (error) {
    if (error instanceof EpubError) throw error;
    throw new EpubError(
      `Không tải được trang truyện: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/** Wraps a standalone post as a one-chapter book. */
function singlePageStory(
  meta: StoryMeta,
  html: string,
  finalUrl: string,
  options: ScrapeOptions,
): ScrapedStory {
  let parsed: { title: string; html: string };
  try {
    parsed = parseChapterPage(html, finalUrl, options);
  } catch {
    throw new EpubError(
      "Trang này không có liên kết chương nào và cũng không có nội dung đọc được. " +
        "Hãy dùng liên kết tới trang mục lục của truyện.",
    );
  }

  return {
    meta,
    chapters: [
      {
        url: finalUrl,
        linkText: parsed.title,
        order: null,
        title: parsed.title,
        html: parsed.html,
        wordCount: countWords(parsed.html),
      },
    ],
    discovered: 0,
    attempted: 1,
    failed: 0,
    truncated: false,
  };
}
