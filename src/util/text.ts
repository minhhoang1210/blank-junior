import { DISCORD_MESSAGE_LIMIT } from "../config.js";

/**
 * Splits text into Discord-sized chunks, preferring paragraph then line then
 * word boundaries so a reply never breaks mid-sentence.
 */
export function chunkForDiscord(
  text: string,
  limit: number = DISCORD_MESSAGE_LIMIT,
): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.length <= limit) return [trimmed];

  const chunks: string[] = [];
  let remaining = trimmed;

  while (remaining.length > limit) {
    const window = remaining.slice(0, limit);
    // Prefer the last paragraph break, then line break, then space.
    const cut =
      lastIndexBefore(window, "\n\n") ??
      lastIndexBefore(window, "\n") ??
      lastIndexBefore(window, " ") ??
      limit;

    chunks.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }

  if (remaining) chunks.push(remaining);
  return chunks.filter(Boolean);
}

function lastIndexBefore(window: string, separator: string): number | undefined {
  const index = window.lastIndexOf(separator);
  // Ignore breaks so early that the chunk would be mostly empty.
  return index > window.length * 0.5 ? index : undefined;
}

/** Shortens a string for logging or embed fields. */
export function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}
