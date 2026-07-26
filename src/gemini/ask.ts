import { ApiError, type GenerateContentResponse } from "@google/genai";
import { config } from "../config.js";
import { logger } from "../util/logger.js";
import { extractText, genai, logUsage, MAX_OUTPUT_TOKENS, MODEL } from "./client.js";

// The rules stay in English — they are precise and models follow them well —
// while the output language is stated explicitly in both prompts and repeated
// here, which is where it actually has to hold.
const FORMATTING_RULES = `
Formatting rules, which matter because this is posted straight into Discord:
- Write in ${config.responseLanguage}. Keep names, code, and links exactly as they appear.
- Keep answers under about 1200 characters unless the question genuinely needs more.
- Plain prose. Use "-" bullets only for genuine lists, and Discord's **bold** sparingly. No markdown headers, no tables.
- Do not append a sources list; the bot adds one from the search results.`;

const SYSTEM_GROUNDED = `You answer questions asked in a Discord channel.

Write your entire response in ${config.responseLanguage}, whatever language the question is asked in.

- Answer the question that was asked. Lead with the answer, then any detail that changes what the reader would do next.
- When the answer depends on information you cannot have — today's weather, current prices, recent events, anything time-sensitive — use Google Search before answering rather than answering from memory or explaining that you lack real-time access.
- If a question needs a location or other detail you were not given, answer for the most likely reading and say which one you assumed. Only ask a clarifying question when no reasonable assumption exists.
- Say plainly when you are unsure or when sources disagree.
${FORMATTING_RULES}`;

/** Used when search is off or its quota refused us: the model has no live data. */
const SYSTEM_OFFLINE = `You answer questions asked in a Discord channel. You have no web access for this answer.

Write your entire response in ${config.responseLanguage}, whatever language the question is asked in.

- Answer the question that was asked. Lead with the answer, then any detail that changes what the reader would do next.
- You cannot look anything up. For questions that depend on current information — today's weather, current prices, recent events — say in one short sentence that you can't check live sources, then give whatever genuinely useful general answer you can (how to find out, what is typical, what was true as of your training). Do not guess at specifics and present them as current.
- If a question needs a location or other detail you were not given, answer for the most likely reading and say which one you assumed.
- Say plainly when you are unsure.
${FORMATTING_RULES}`;

export interface Answer {
  text: string;
  /** Deduplicated pages the model grounded its answer on. */
  sources: { title: string; url: string }[];
  searched: boolean;
  /** True when grounding was wanted but its quota refused the request. */
  groundingRefused: boolean;
}

export async function answerQuestion(question: string): Promise<Answer> {
  let groundingRefused = false;
  let response: GenerateContentResponse;

  if (config.enableSearchGrounding) {
    try {
      response = await generate(question, true);
    } catch (error) {
      // Grounding carries its own quota, separate from generation, and a key
      // with none gets a 429 on every grounded call. Retrying without the tool
      // still answers the question instead of failing outright.
      if (!(error instanceof ApiError) || error.status !== 429) throw error;

      logger.warn("Google Search grounding refused (HTTP 429); retrying without it.");
      groundingRefused = true;
      response = await generate(question, false);
    }
  } else {
    response = await generate(question, false);
  }

  logUsage(groundingRefused ? "/ask (ungrounded fallback)" : "/ask", response);

  const grounding = response.candidates?.[0]?.groundingMetadata;

  return {
    text: extractText(response),
    sources: collectSources(response),
    searched: (grounding?.webSearchQueries?.length ?? 0) > 0,
    groundingRefused,
  };
}

/**
 * Google Search grounding runs server-side within this single call — there is
 * no client-side tool loop to drive.
 */
function generate(question: string, grounded: boolean): Promise<GenerateContentResponse> {
  return genai.models.generateContent({
    model: MODEL,
    contents: question,
    config: {
      systemInstruction: grounded ? SYSTEM_GROUNDED : SYSTEM_OFFLINE,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      ...(grounded ? { tools: [{ googleSearch: {} }] } : {}),
    },
  });
}

/** Reads grounding chunks into a deduplicated source list. */
function collectSources(response: GenerateContentResponse): Answer["sources"] {
  const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const seen = new Set<string>();
  const sources: Answer["sources"] = [];

  for (const chunk of chunks) {
    const url = chunk.web?.uri;
    if (!url || seen.has(url)) continue;
    seen.add(url);
    sources.push({ title: chunk.web?.title || chunk.web?.domain || url, url });
  }

  return sources;
}
