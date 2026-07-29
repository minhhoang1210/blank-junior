import type { Message, TextBasedChannel } from "discord.js";
import { HistoryError } from "./history-error.js";
import { collectRecentMessages } from "./history-paginate.js";
import { clipContent, type CapturedMessage } from "./transcript.js";

export { HistoryError };
export { buildTranscript, type CapturedMessage } from "./transcript.js";

/**
 * Fetches the most recent `limit` messages via a gateway client, oldest first.
 *
 * Used by the long-running bot (`src/index.ts`). The serverless entrypoint uses
 * `history-rest.ts` instead, which has the same contract over plain REST — both
 * walk the channel through `history-paginate.ts`, so only the fetch and the
 * message shape differ between them.
 */
export function fetchRecentMessages(
  channel: TextBasedChannel,
  limit: number,
  excludeAuthorId: string,
): Promise<CapturedMessage[]> {
  return collectRecentMessages(
    {
      fetchBatch: async (batchSize, before) => {
        const batch = await channel.messages.fetch({
          limit: batchSize,
          ...(before ? { before } : {}),
        });
        return [...batch.values()];
      },
      identify: (message) => ({ id: message.id, authorId: message.author.id }),
      capture,
    },
    limit,
    excludeAuthorId,
  );
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
