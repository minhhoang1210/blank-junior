import type { Collection, Message, TextBasedChannel } from "discord.js";
import { DISCORD_FETCH_BATCH } from "../config.js";
import { strings } from "../core/strings.js";
import { HistoryError } from "./history-error.js";
import { clipContent, type CapturedMessage } from "./transcript.js";

export { HistoryError };
export { buildTranscript, type CapturedMessage } from "./transcript.js";

/**
 * Fetches the most recent `limit` messages via a gateway client, oldest first.
 *
 * Used by the long-running bot (`src/index.ts`). The serverless entrypoint uses
 * `history-rest.ts` instead, which has the same contract over plain REST.
 *
 * Discord caps a fetch at 100, so anything larger is paginated with the
 * `before` cursor. Messages from `excludeAuthorId` (the bot itself) are
 * skipped so previous summaries don't feed into new ones.
 */
export async function fetchRecentMessages(
  channel: TextBasedChannel,
  limit: number,
  excludeAuthorId: string,
): Promise<CapturedMessage[]> {
  const collected: CapturedMessage[] = [];
  let before: string | undefined;
  let remaining = limit;

  while (remaining > 0) {
    const batchSize = Math.min(DISCORD_FETCH_BATCH, remaining);

    let batch: Collection<string, Message>;
    try {
      batch = await channel.messages.fetch({ limit: batchSize, ...(before ? { before } : {}) });
    } catch {
      throw new HistoryError(strings.missingHistoryPermission);
    }

    if (batch.size === 0) break;

    // Discord returns newest first within a batch.
    for (const message of batch.values()) {
      before = message.id;
      if (message.author.id === excludeAuthorId) continue;
      const captured = capture(message);
      if (captured) collected.push(captured);
    }

    remaining -= batch.size;
    if (batch.size < batchSize) break;
  }

  // Collected newest-first across batches; the transcript reads chronologically.
  return collected.reverse();
}

function capture(message: Message): CapturedMessage | undefined {
  // cleanContent resolves mentions to display names, so the model sees
  // "@Alice" rather than a raw snowflake it can't interpret.
  const content = message.cleanContent.trim();
  const attachments = message.attachments.size + message.embeds.length;

  if (!content && attachments === 0) return undefined;

  return {
    id: message.id,
    author: message.member?.displayName || message.author.displayName || message.author.username,
    isBot: message.author.bot,
    createdAt: message.createdAt,
    content: clipContent(content),
    attachments,
  };
}
