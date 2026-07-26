import { HistoryError } from "../discord/history-error.js";
import { describeGeminiError } from "../gemini/client.js";
import { logger } from "../util/logger.js";
import { chunkForDiscord } from "../util/text.js";
import { asError, strings } from "./strings.js";
import type { BotReply, ReplyTransport } from "./types.js";

/**
 * Sends a reply, spilling into follow-up messages when the text exceeds
 * Discord's 2000-character limit.
 */
export async function deliver(transport: ReplyTransport, reply: BotReply): Promise<void> {
  const chunks = chunkForDiscord(reply.text);

  await transport.edit(chunks[0] ?? strings.emptyResponse, reply.embeds);

  for (const chunk of chunks.slice(1)) {
    await transport.followUp(chunk);
  }
}

/**
 * Reports a failure in place of the reply.
 *
 * Best-effort: if even this can't be delivered there is nothing left to try,
 * so it is logged rather than rethrown.
 */
export async function deliverError(transport: ReplyTransport, error: unknown): Promise<void> {
  await transport.edit(asError(toUserMessage(error)), []).catch((cause: unknown) => {
    logger.error(`Could not deliver error message: ${describeError(cause)}`);
  });
}

/** Turns any thrown value into something worth showing a user. */
export function toUserMessage(error: unknown): string {
  return error instanceof HistoryError ? error.message : describeGeminiError(error);
}

/** Compact rendering of a thrown value, for logs. */
export function describeError(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}
