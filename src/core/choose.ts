import { randomInt } from "node:crypto";
import { truncate } from "../util/text.js";
import { strings } from "./strings.js";
import { BRAND_COLOUR, type BotReply, type Embed } from "./types.js";

/** What separates one option from the next. */
export const CHOICE_SEPARATOR = "|";

/** Fewer than two is not a choice; past twenty the reply stops being readable. */
export const MIN_CHOICES = 2;
export const MAX_CHOICES = 20;

/** Per-option cap in the candidate list, so one long entry can't crowd it out. */
const MAX_CHOICE_CHARS = 60;

/**
 * Splits the raw option string into candidates.
 *
 * Blank entries are dropped, so `a||b` and a trailing separator are both fine.
 * Duplicates are kept: repeating an option is the only way to weight it, and
 * silently collapsing them would change the odds the user asked for.
 */
export function parseChoices(raw: string): string[] {
  return raw
    .split(CHOICE_SEPARATOR)
    .map((choice) => choice.trim())
    .filter(Boolean);
}

/**
 * Uniformly random index below `count`.
 *
 * `crypto.randomInt` rather than `Math.random`, which skews once the range
 * doesn't divide evenly into its output — a tiny bias anywhere else, but being
 * fair is the entire job of this command.
 */
export function pickIndex(count: number): number {
  return randomInt(count);
}

/** Renders an already-made pick. Split from the draw so it can be asserted on. */
export function formatChoice(choices: string[], index: number): BotReply {
  const embed: Embed = {
    color: BRAND_COLOUR,
    footer: { text: strings.choose.footer(choices.length) },
    fields: [{ name: strings.choose.candidates, value: candidateList(choices, index) }],
  };

  return { text: strings.choose.result(choices[index] ?? ""), embeds: [embed] };
}

/** Draws one of the candidates and formats the reply. */
export function chooseCommand(choices: string[]): BotReply {
  return formatChoice(choices, pickIndex(choices.length));
}

/** Embed field values are capped at 1024 characters by Discord. */
function candidateList(choices: string[], index: number): string {
  return choices
    .map((choice, position) => {
      const label = truncate(choice, MAX_CHOICE_CHARS);
      return position === index ? `• **${label}**` : `• ${label}`;
    })
    .join("\n")
    .slice(0, 1024);
}
