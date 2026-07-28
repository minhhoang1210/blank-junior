import { answerQuestion, type Answer } from "../gemini/ask.js";
import { logger } from "../util/logger.js";
import { truncate } from "../util/text.js";
import type { CommandJob } from "./run.js";
import { strings } from "./strings.js";
import { BRAND_COLOUR, type BotReply, type Embed } from "./types.js";

/** How many grounding sources to list under an answer. */
const MAX_SOURCES = 5;

/** `/ask` as a runnable job. Both transports invoke it through this. */
export function askJob(question: string, actor?: string): CommandJob {
  return { name: "ask", ...(actor ? { actor } : {}), build: () => answerCommand(question) };
}

/** Answers the question and formats it — everything except sending. */
export async function answerCommand(question: string): Promise<BotReply> {
  const answer = await answerQuestion(question);

  const embed: Embed = {
    color: BRAND_COLOUR,
    author: { name: truncate(question, 256) },
    footer: { text: footerFor(answer) },
  };

  const sources = formatSources(answer);
  if (sources) {
    embed.fields = [{ name: strings.ask.sources, value: sources }];
  }

  logger.info(`/ask answered${answer.searched ? " (grounded)" : ""}`);

  return { text: answer.text, embeds: [embed] };
}

function footerFor(answer: Answer): string {
  if (answer.searched) return strings.ask.grounded;
  if (answer.groundingRefused) return strings.ask.ungrounded;
  return strings.ask.plain;
}

/** Embed field values are capped at 1024 characters by Discord. */
function formatSources(answer: Answer): string | undefined {
  if (answer.sources.length === 0) return undefined;

  return answer.sources
    .slice(0, MAX_SOURCES)
    .map((source, index) => `${index + 1}. [${truncate(source.title, 70)}](${source.url})`)
    .join("\n")
    .slice(0, 1024);
}
