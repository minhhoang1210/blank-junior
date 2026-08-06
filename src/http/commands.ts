import { config } from "../config.js";
import { askJob } from "../core/ask.js";
import { describeError } from "../core/deliver.js";
import { ocrJob } from "../core/ocr.js";
import { runCommand } from "../core/run.js";
import { tldrJob } from "../core/tldr.js";
import type { Attachment, Embed, ReplyTransport } from "../core/types.js";
import type { AttachmentRef } from "../discord/attachment.js";
import { fetchRecentMessagesRest } from "../discord/history-rest.js";
import { createFollowup, editOriginalResponse, fetchChannel } from "../discord/rest.js";
import { logger } from "../util/logger.js";

/**
 * Reply transport backed by the interaction webhook.
 *
 * The serverless path has already answered Discord with a deferred response, so
 * the real reply arrives by editing that placeholder afterwards.
 */
function webhookTransport(token: string): ReplyTransport {
  return {
    async edit(content: string, embeds: Embed[], file?: Attachment): Promise<void> {
      await editOriginalResponse(token, { content, embeds }, file);
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
async function resolveChannelName(channelId: string): Promise<string | undefined> {
  try {
    return (await fetchChannel(channelId)).name ?? undefined;
  } catch (error) {
    logger.warn(`Could not resolve channel name: ${describeError(error)}`);
    return undefined;
  }
}

export function runTldr(
  token: string,
  channelId: string,
  requested: number,
  channelName?: string,
): Promise<void> {
  return runCommand(
    webhookTransport(token),
    tldrJob({
      // For a bot application the bot user's id equals the application id, so
      // this is what filters out the bot's own previous summaries.
      fetchMessages: (limit) => fetchRecentMessagesRest(channelId, limit, config.clientId),
      requested,
      channelName: channelName ?? (() => resolveChannelName(channelId)),
    }),
  );
}

export function runAsk(token: string, question: string): Promise<void> {
  return runCommand(webhookTransport(token), askJob(question));
}

/** One CDN download plus one model call fits inside `maxDuration` comfortably. */
export function runOcr(token: string, attachment: AttachmentRef): Promise<void> {
  return runCommand(webhookTransport(token), ocrJob(attachment));
}
