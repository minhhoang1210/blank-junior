/**
 * Lists the Gemini models this API key can actually use.
 *
 *   npm run models
 *
 * Google retires models on its own schedule, and a retired one stays available
 * to existing users while returning 404 to new keys — so the only reliable
 * source of truth is asking with your own key. Put the name of one that
 * supports generateContent into GEMINI_MODEL.
 */
import { GoogleGenAI } from "@google/genai";
import "dotenv/config";

const apiKey = process.env.GEMINI_API_KEY?.trim();
if (!apiKey) {
  console.error("GEMINI_API_KEY is not set. Add it to .env first.");
  process.exit(1);
}

const genai = new GoogleGenAI({ apiKey });

interface Row {
  id: string;
  displayName: string;
  output: number | undefined;
  thinking: boolean | undefined;
}

const rows: Row[] = [];

for await (const model of await genai.models.list()) {
  // Only models that can answer a generateContent call are usable here.
  if (model.supportedActions && !model.supportedActions.includes("generateContent")) continue;

  rows.push({
    // The API returns "models/gemini-x"; GEMINI_MODEL wants the bare name.
    id: (model.name ?? "").replace(/^models\//, ""),
    displayName: model.displayName ?? "",
    output: model.outputTokenLimit,
    thinking: model.thinking,
  });
}

if (rows.length === 0) {
  console.log("No models available to this key that support generateContent.");
  process.exit(1);
}

rows.sort((a, b) => a.id.localeCompare(b.id));

const width = Math.max(...rows.map((row) => row.id.length));
console.log(`${rows.length} usable model(s) for this key:\n`);
for (const row of rows) {
  const notes = [
    row.output ? `${row.output} out` : undefined,
    row.thinking ? "thinking" : undefined,
  ]
    .filter(Boolean)
    .join(", ");
  console.log(`  ${row.id.padEnd(width)}  ${row.displayName}${notes ? `  (${notes})` : ""}`);
}

console.log(`\nSet one of these in .env, e.g.:\n  GEMINI_MODEL=${rows[0]?.id}`);
