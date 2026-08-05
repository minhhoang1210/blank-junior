import { config } from "../config.js";
import { buildEpub } from "../epub/build.js";
import { EpubError } from "../epub/errors.js";
import { fetchBinary } from "../epub/fetcher.js";
import { scrapeStory } from "../epub/scrape.js";
import { slugify } from "../epub/text.js";
import { logger } from "../util/logger.js";
import { formatBytes, truncate } from "../util/text.js";
import type { CommandJob } from "./run.js";
import { strings } from "./strings.js";
import { BRAND_COLOUR, type BotReply } from "./types.js";

/** Pause between chapter fetches, per worker — enough to stay a polite visitor. */
const CHAPTER_DELAY_MS = 250;
const RETRIES = 2;
/** No single illustration is worth this much of the attachment budget. */
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

export interface EpubRequest {
  url: string;
  /** Wall-clock allowance for the whole job; the two deployments differ wildly. */
  budgetMs: number;
  onProgress?: (message: string) => void;
}

/**
 * Accepts the URL as typed and returns one that can be fetched.
 *
 * Discord users paste links wrapped in `<>` to suppress the embed, and often
 * leave the scheme off entirely.
 */
export function normaliseStoryUrl(raw: string): string {
  const trimmed = raw.trim().replace(/^<|>$/g, "");
  const withScheme = /^[a-z][\w+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new EpubError(strings.epub.invalidUrl);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new EpubError(strings.epub.invalidUrl);
  }
  return url.toString();
}

/**
 * Scrapes the story and packages it — everything except sending.
 *
 * The book is built twice in the rare case that the first one is too big for
 * Discord: chapters are already in memory by then, so dropping the images and
 * repacking costs no extra requests to the source site.
 */
export async function buildStoryEpub(request: EpubRequest): Promise<BotReply> {
  const url = normaliseStoryUrl(request.url);
  const started = Date.now();
  const limitBytes = config.epubMaxUploadMb * 1024 * 1024;

  request.onProgress?.(strings.epub.readingIndex);

  const story = await scrapeStory(url, {
    concurrency: config.epubConcurrency,
    delayMs: CHAPTER_DELAY_MS,
    retries: RETRIES,
    maxChapters: config.epubMaxChapters,
    deadline: started + request.budgetMs,
    stripImages: false,
    onProgress: (done, total) => request.onProgress?.(strings.epub.downloading(done, total)),
  });

  request.onProgress?.(strings.epub.packing);

  let data = await buildEpub(story.meta, story.chapters, {
    fetchImage: (target) => fetchBinary(target),
    imageBudget: { maxBytes: Math.floor(limitBytes * 0.5), maxImageBytes: MAX_IMAGE_BYTES },
    onWarning: (message) => logger.warn(`/epub: ${message}`),
  });

  if (data.length > limitBytes) {
    request.onProgress?.(strings.epub.retryingWithoutImages);
    data = await buildEpub(story.meta, story.chapters, {});
  }

  if (data.length > limitBytes) {
    throw new EpubError(strings.epub.tooLarge(formatBytes(data.length), `${config.epubMaxUploadMb} MB`));
  }

  const words = story.chapters.reduce((total, chapter) => total + (chapter.wordCount ?? 0), 0);
  logger.info(
    `/epub built "${story.meta.title}" — ${story.chapters.length} chapter(s), ` +
      `${formatBytes(data.length)}, ${Math.round((Date.now() - started) / 1000)}s`,
  );

  return {
    text: [
      strings.epub.ready(story.meta.title),
      story.truncated ? strings.epub.truncated(story.chapters.length, story.discovered) : "",
      story.failed > 0 ? strings.epub.someFailed(story.failed) : "",
    ].join(""),
    embeds: [
      {
        color: BRAND_COLOUR,
        ...(story.meta.author ? { author: { name: truncate(story.meta.author, 256) } } : {}),
        fields: [
          { name: strings.epub.chapters, value: String(story.chapters.length), inline: true },
          { name: strings.epub.words, value: words.toLocaleString("vi-VN"), inline: true },
          { name: strings.epub.size, value: formatBytes(data.length), inline: true },
        ],
        footer: { text: strings.epub.source(hostOf(story.meta.sourceUrl)) },
      },
    ],
    file: {
      filename: `${slugify(story.meta.title)}.epub`,
      data,
      contentType: "application/epub+zip",
    },
  };
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/**
 * `/epub` as a runnable job.
 *
 * `budgetMs` is the one thing the two transports genuinely disagree on: the
 * gateway has minutes, the serverless function has seconds before it is killed.
 */
export function epubJob(url: string, budgetMs: number, actor?: string): CommandJob {
  return {
    name: "epub",
    ...(actor ? { actor } : {}),
    build: (report) => buildStoryEpub({ url, budgetMs, onProgress: report }),
  };
}
