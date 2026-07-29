import { DISCORD_FETCH_BATCH } from "../config.js";
import { strings } from "../core/strings.js";
import { HistoryError } from "./history-error.js";
import type { CapturedMessage } from "./transcript.js";

/**
 * Where a batch of messages comes from, and how to read one.
 *
 * The gateway client and the REST client return different shapes, but the
 * walk over them is identical — page backwards with a cursor, skip the bot's
 * own posts, stop at the limit. Only these three operations differ.
 */
export interface HistorySource<T> {
  /** Fetches one batch, newest first. Discord caps `limit` at 100. */
  fetchBatch(limit: number, before?: string): Promise<T[]>;
  /** The message's own id — the pagination cursor — and its author's. */
  identify(message: T): { id: string; authorId: string };
  /** Maps to the shared shape, or `undefined` for a message worth skipping. */
  capture(message: T): CapturedMessage | undefined;
}

/**
 * Fetches the most recent `limit` messages from a source, oldest first.
 *
 * Discord caps a fetch at 100, so anything larger is paginated with the
 * `before` cursor. Messages from `excludeAuthorId` (the bot itself) are
 * skipped so previous summaries don't feed into new ones.
 *
 * Shared by both transports: this loop's accounting — advancing the cursor
 * past skipped messages, counting them against the limit, and stopping on a
 * short batch — is subtle enough that two copies would eventually disagree.
 */
export async function collectRecentMessages<T>(
  source: HistorySource<T>,
  limit: number,
  excludeAuthorId: string,
): Promise<CapturedMessage[]> {
  const collected: CapturedMessage[] = [];
  let before: string | undefined;
  let remaining = limit;

  while (remaining > 0) {
    const batchSize = Math.min(DISCORD_FETCH_BATCH, remaining);

    let batch: T[];
    try {
      batch = await source.fetchBatch(batchSize, before);
    } catch {
      throw new HistoryError(strings.missingHistoryPermission);
    }

    if (batch.length === 0) break;

    // Discord returns newest first within a batch.
    for (const message of batch) {
      const { id, authorId } = source.identify(message);
      // The cursor advances past skipped messages too — otherwise a run of the
      // bot's own posts would be re-fetched forever.
      before = id;
      if (authorId === excludeAuthorId) continue;

      const captured = source.capture(message);
      if (captured) collected.push(captured);
    }

    remaining -= batch.length;
    if (batch.length < batchSize) break;
  }

  // Collected newest-first across batches; the transcript reads chronologically.
  return collected.reverse();
}
