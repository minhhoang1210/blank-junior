import { chat, type ChatResult } from "../gemini/chat.js";
import { logger } from "../util/logger.js";
import { truncate } from "../util/text.js";
import type { CommandJob } from "./run.js";
import { strings } from "./strings.js";
import { BRAND_COLOUR, type BotReply, type Embed } from "./types.js";

/** How many grounding sources to list under a reply. */
const MAX_SOURCES = 5;

/** `/chat` as a runnable job. Both transports invoke it through this. */
export function chatJob(message: string, actor?: string): CommandJob {
  return { name: "chat", ...(actor ? { actor } : {}), build: () => chatCommand(message) };
}

/** Handles the message and formats the reply — everything except sending. */
export async function chatCommand(message: string): Promise<BotReply> {
  const result = await chat(message);

  const embed: Embed = {
    color: BRAND_COLOUR,
    author: { name: truncate(message, 256) },
    footer: { text: footerFor(result) },
  };

  const sources = formatSources(result);
  if (sources) {
    embed.fields = [{ name: strings.chat.sources, value: sources }];
  }

  logger.info(`/chat replied${result.searched ? " (grounded)" : ""}`);

  return { text: result.text, embeds: [embed] };
}

function footerFor(result: ChatResult): string {
  if (result.searched) return strings.chat.grounded;
  if (result.groundingRefused) return strings.chat.ungrounded;
  return strings.chat.plain;
}

/** Embed field values are capped at 1024 characters by Discord. */
function formatSources(result: ChatResult): string | undefined {
  if (result.sources.length === 0) return undefined;

  return result.sources
    .slice(0, MAX_SOURCES)
    .map((source, index) => `${index + 1}. [${truncate(source.title, 70)}](${source.url})`)
    .join("\n")
    .slice(0, 1024);
}
