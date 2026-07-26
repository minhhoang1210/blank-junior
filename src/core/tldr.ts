import { MAX_TLDR_MESSAGES, MIN_TLDR_MESSAGES } from "../config.js";
import { buildTranscript, type CapturedMessage } from "../discord/transcript.js";
import { summariseConversation } from "../gemini/summarize.js";
import { logger } from "../util/logger.js";
import { strings } from "./strings.js";
import { BRAND_COLOUR, type BotReply } from "./types.js";

/**
 * Supplies the channel's recent messages, oldest first.
 *
 * The gateway path reads them through a discord.js channel and the serverless
 * path over raw REST, so the command takes a fetcher rather than either.
 */
export type MessageFetcher = (limit: number) => Promise<CapturedMessage[]>;

export function clampMessageCount(requested: number): number {
  if (!Number.isFinite(requested)) return MIN_TLDR_MESSAGES;
  return Math.min(Math.max(Math.trunc(requested), MIN_TLDR_MESSAGES), MAX_TLDR_MESSAGES);
}

/**
 * Fetches, summarises, and formats — everything except sending.
 *
 * `channelName` is optional because the serverless path may not be able to
 * resolve it; the title then omits the channel rather than naming it vaguely.
 */
export async function summariseChannel(
  fetchMessages: MessageFetcher,
  requested: number,
  channelName?: string,
): Promise<BotReply> {
  const count = clampMessageCount(requested);
  const messages = await fetchMessages(count);

  if (messages.length === 0) {
    return { text: strings.tldr.nothingToSummarise, embeds: [] };
  }

  const summary = await summariseConversation({
    transcript: buildTranscript(messages),
    messageCount: messages.length,
    channelName: channelName ?? strings.tldr.thisChannel,
  });

  logger.info(`/tldr summarised ${messages.length} message(s)`);

  return {
    text: summary,
    embeds: [
      {
        title: strings.tldr.title(channelName),
        color: BRAND_COLOUR,
        footer: { text: strings.tldr.footer(messages.length, count) },
      },
    ],
  };
}
