import { collectRecentMessages } from "./history-paginate.js";
import { fetchChannelMessages, type RawMessage } from "./rest.js";
import { clipContent, type CapturedMessage } from "./transcript.js";

/**
 * Fetches the most recent `limit` messages over REST, oldest first.
 *
 * Same contract as the gateway fetcher — and the same paging loop, from
 * `history-paginate.ts` — but usable from a serverless function where no
 * gateway client exists.
 */
export function fetchRecentMessagesRest(
  channelId: string,
  limit: number,
  excludeAuthorId: string,
): Promise<CapturedMessage[]> {
  return collectRecentMessages(
    {
      fetchBatch: (batchSize, before) =>
        fetchChannelMessages(channelId, {
          limit: batchSize,
          ...(before ? { before } : {}),
        }),
      identify: (message) => ({ id: message.id, authorId: message.author.id }),
      capture,
    },
    limit,
    excludeAuthorId,
  );
}

/** Maps a REST payload to the shared shape, resolving user mentions by hand. */
export function capture(message: RawMessage): CapturedMessage | undefined {
  const content = resolveMentions(message).trim();
  const attachments = (message.attachments?.length ?? 0) + (message.embeds?.length ?? 0);

  if (!content && attachments === 0) return undefined;

  return {
    id: message.id,
    author:
      message.member?.nick ||
      message.author.global_name ||
      message.author.username,
    isBot: message.author.bot === true,
    createdAt: new Date(message.timestamp),
    content: clipContent(content),
    attachments,
  };
}

/**
 * The gateway client exposes `cleanContent`; over REST the raw `<@id>` form
 * comes through instead, which the model can't interpret. The payload carries
 * the mentioned users, so user mentions can be swapped for display names.
 * Channel and role mentions are left alone — they aren't resolvable from this
 * payload alone and are rare in prose.
 */
function resolveMentions(message: RawMessage): string {
  let content = message.content;

  for (const user of message.mentions ?? []) {
    const name = user.global_name || user.username;
    content = content.replaceAll(`<@${user.id}>`, `@${name}`);
    content = content.replaceAll(`<@!${user.id}>`, `@${name}`);
  }

  return content;
}
