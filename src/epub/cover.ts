import { escapeXml } from "./dom.js";

const WIDTH = 1200;
const HEIGHT = 1800;
const TITLE_SIZE = 82;
const LINE_HEIGHT = 104;
/** Georgia's average glyph is a little over half its point size at these weights. */
const TITLE_CHARS_PER_LINE = Math.floor((WIDTH - 260) / (TITLE_SIZE * 0.56));
const MAX_TITLE_LINES = 7;

/**
 * Draws a simple typographic cover so the book shows something in a library grid.
 *
 * SVG rather than a raster image: the browser version of this scraper had a
 * `<canvas>` to draw on, and the Node equivalent would mean a native image
 * library for what is only ever text on a gradient. Readers that cannot show an
 * SVG thumbnail fall back to a plain entry, which is what they would have shown
 * with no cover at all.
 */
export function renderCover(title: string, author: string): string {
  const lines = wrapText(title.toUpperCase(), TITLE_CHARS_PER_LINE).slice(0, MAX_TITLE_LINES);
  const startY = HEIGHT / 2 - ((lines.length - 1) * LINE_HEIGHT) / 2;

  const titleTspans = lines
    .map(
      (line, index) =>
        `    <text x="${WIDTH / 2}" y="${startY + index * LINE_HEIGHT}" class="title">${escapeXml(line)}</text>`,
    )
    .join("\n");

  const byline = author
    ? `\n    <text x="${WIDTH / 2}" y="${HEIGHT - 220}" class="author">${escapeXml(truncate(author, 40))}</text>`
    : "";

  return `<?xml version="1.0" encoding="utf-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#1e1b4b"/>
      <stop offset="0.55" stop-color="#312e81"/>
      <stop offset="1" stop-color="#0f172a"/>
    </linearGradient>
  </defs>
  <style>
    .title { fill: #f8fafc; font-family: Georgia, serif; font-size: ${TITLE_SIZE}px; font-weight: bold; text-anchor: middle; }
    .author { fill: #e2e8f0; font-family: Georgia, serif; font-size: 44px; font-style: italic; text-anchor: middle; }
  </style>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
  <rect x="60" y="60" width="${WIDTH - 120}" height="${HEIGHT - 120}" fill="none" stroke="#e2e8f0" stroke-opacity="0.35" stroke-width="4"/>
${titleTspans}${byline}
</svg>
`;
}

/** Greedy word wrap; a single word longer than the budget gets its own line. */
function wrapText(text: string, maxChars: number): string[] {
  const lines: string[] = [];
  let current = "";

  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }

  if (current) lines.push(current);
  return lines;
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}
