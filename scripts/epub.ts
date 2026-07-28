/**
 * Builds the same EPUB /epub would, straight to a file.
 *
 *   npm run epub -- https://example.wordpress.com/muc-luc-truyen/
 *   npm run epub -- <url> --out book.epub --max 20
 *
 * Everything except the Discord round-trip: same scraper, same builder, same
 * limits. Use it to check a source site before wiring anyone's server to it, or
 * to see why a book came out short — the per-chapter progress here is the
 * detail the throttled Discord status message cannot show.
 *
 * Needs no bot token; the .env in this repo is not read.
 */
import { writeFile } from "node:fs/promises";
import { buildEpub } from "../src/epub/build.js";
import { EpubError } from "../src/epub/errors.js";
import { fetchBinary } from "../src/epub/fetcher.js";
import { scrapeStory } from "../src/epub/scrape.js";
import { slugify } from "../src/epub/text.js";

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

const url = process.argv[2];
if (!url || url.startsWith("--")) {
  console.error("Usage: npm run epub -- <story-url> [--out file.epub] [--max 50] [--no-images]");
  process.exit(1);
}

const maxChapters = Number.parseInt(flag("max") ?? "400", 10);
const withImages = !process.argv.includes("--no-images");
const started = Date.now();

try {
  const story = await scrapeStory(url, {
    concurrency: 4,
    delayMs: 250,
    retries: 2,
    maxChapters: Number.isFinite(maxChapters) ? maxChapters : 400,
    deadline: Number.MAX_SAFE_INTEGER,
    stripImages: !withImages,
    onProgress: (done, total) => process.stdout.write(`\r  chapters ${done}/${total}   `),
  });

  console.log(`\n\n"${story.meta.title}"${story.meta.author ? ` — ${story.meta.author}` : ""}`);
  console.log(
    `  ${story.chapters.length} chapter(s) of ${story.discovered || 1} found` +
      `${story.failed ? `, ${story.failed} failed` : ""}${story.truncated ? ", truncated" : ""}`,
  );

  const data = await buildEpub(story.meta, story.chapters, {
    ...(withImages
      ? {
          fetchImage: (target: string) => fetchBinary(target),
          imageBudget: { maxBytes: 64 * 1024 * 1024, maxImageBytes: 4 * 1024 * 1024 },
        }
      : {}),
    onWarning: (message) => console.warn(`  warn: ${message}`),
  });

  const out = flag("out") ?? `${slugify(story.meta.title)}.epub`;
  await writeFile(out, data);

  const words = story.chapters.reduce((total, chapter) => total + (chapter.wordCount ?? 0), 0);
  console.log(
    `\nWrote ${out} — ${(data.length / 1024 / 1024).toFixed(2)} MB, ` +
      `${words.toLocaleString("en-US")} words, ${Math.round((Date.now() - started) / 1000)}s`,
  );
} catch (error) {
  console.error(`\n${error instanceof EpubError ? error.message : String(error)}`);
  process.exit(1);
}
