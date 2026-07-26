import { config } from "../config.js";
import { answerCommand } from "../core/ask.js";
import { deliver, deliverError, describeError } from "../core/deliver.js";
import { strings } from "../core/strings.js";
import { summariseChannel } from "../core/tldr.js";
import type { Embed, ReplyTransport } from "../core/types.js";
import { fetchRecentMessagesRest } from "../discord/history-rest.js";
import { createFollowup, editOriginalResponse, fetchChannel } from "../discord/rest.js";
import { logger } from "../util/logger.js";

/**
 * Reply transport backed by the interaction webhook.
 *
 * The serverless path has already answered Discord with a deferred response,
 * so the real reply arrives by editing that placeholder afterwards.
 */
function webhookTransport(token: string): ReplyTransport {
  return {
    async edit(content: string, embeds: Embed[]): Promise<void> {
      await editOriginalResponse(token, { content, embeds });
    },
    async followUp(content: string): Promise<void> {
      await createFollowup(token, { content });
    },
  };
}

/**
 * Resolves the channel's display name.
 *
 * The interaction payload normally carries it; when it doesn't, one extra REST
 * call gets it. A failure here must not sink the summary, so it degrades to an
 * untitled one.
 */
async function resolveChannelName(
  channelId: string,
  fromInteraction?: string,
): Promise<string | undefined> {
  if (fromInteraction) return fromInteraction;

  try {
    const channel = await fetchChannel(channelId);
    return channel.name ?? undefined;
  } catch (error) {
    logger.warn(`Could not resolve channel name: ${describeError(error)}`);
    return undefined;
  }
}

export async function runTldr(
  token: string,
  channelId: string,
  requested: number,
  channelName?: string,
): Promise<void> {
  const transport = webhookTransport(token);

  try {
    const reply = await summariseChannel(
      // For a bot application the bot user's id equals the application id, so
      // this is what filters out the bot's own previous summaries.
      (limit) => fetchRecentMessagesRest(channelId, limit, config.clientId),
      requested,
      await resolveChannelName(channelId, channelName),
    );
    await deliver(transport, reply);
  } catch (error) {
    logger.error(`/tldr failed: ${describeError(error)}`);
    await deliverError(transport, error);
  }
}

export async function runAsk(token: string, question: string): Promise<void> {
  const transport = webhookTransport(token);

  try {
    await deliver(transport, await answerCommand(question));
  } catch (error) {
    logger.error(`/ask failed: ${describeError(error)}`);
    await deliverError(transport, error);
  }
}
