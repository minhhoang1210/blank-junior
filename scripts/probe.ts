/**
 * Isolates *which* quota is refusing a request.
 *
 *   npm run probe
 *
 * A 429 can mean two very different things:
 *   - the model itself has no free-tier quota for this key, or
 *   - the model is fine and Google Search grounding is what has none.
 *
 * Grounding is billed and quota'd separately from generation, so the only way
 * to tell them apart is to make the same call twice, once with the tool and
 * once without. Runs two tiny requests; costs a handful of tokens.
 */
import { ApiError, GoogleGenAI } from "@google/genai";
import "dotenv/config";

const apiKey = process.env.GEMINI_API_KEY?.trim();
if (!apiKey) {
  console.error("GEMINI_API_KEY is not set. Add it to .env first.");
  process.exit(1);
}

const model = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
const genai = new GoogleGenAI({ apiKey });

console.log(`Probing model: ${model}\n`);

interface Outcome {
  ok: boolean;
  status?: number;
  detail: string;
}

async function probe(label: string, useGrounding: boolean): Promise<Outcome> {
  try {
    const response = await genai.models.generateContent({
      model,
      contents: "Reply with the single word: OK",
      config: {
        maxOutputTokens: 2048,
        ...(useGrounding ? { tools: [{ googleSearch: {} }] } : {}),
      },
    });

    const used = response.usageMetadata?.totalTokenCount ?? 0;
    const text = response.text?.trim().slice(0, 40) ?? "(no text)";
    return { ok: true, detail: `replied ${JSON.stringify(text)}, ${used} tokens` };
  } catch (error) {
    if (error instanceof ApiError) {
      let message = error.message;
      try {
        message = (JSON.parse(error.message) as { error?: { message?: string } }).error?.message ?? message;
      } catch {
        // Non-JSON body: fall back to the raw message.
      }
      return { ok: false, status: error.status, detail: message.trim() };
    }
    return { ok: false, detail: error instanceof Error ? error.message : String(error) };
  } finally {
    void label;
  }
}

const plain = await probe("plain", false);
console.log(`1. Generation only (no tools)     ${plain.ok ? "✅ OK" : `❌ ${plain.status ?? "error"}`}`);
console.log(`   ${plain.detail}\n`);

const grounded = await probe("grounded", true);
console.log(`2. With Google Search grounding   ${grounded.ok ? "✅ OK" : `❌ ${grounded.status ?? "error"}`}`);
console.log(`   ${grounded.detail}\n`);

console.log("---");
if (plain.ok && grounded.ok) {
  console.log("Both work. The 429 was a genuine per-minute/per-day limit — wait and retry.");
} else if (plain.ok && !grounded.ok) {
  console.log(
    `Generation works; Google Search grounding does not on ${model}.\n` +
      "Set ENABLE_SEARCH_GROUNDING=false in .env — /chat will then reply from model\n" +
      "knowledge only, and /tldr is unaffected. To keep grounding, switch to a model\n" +
      "whose free tier includes it (npm run models) or enable billing.",
  );
} else if (!plain.ok && grounded.ok) {
  console.log("Odd: grounded works but plain does not. Re-run; if it persists it's transient.");
} else {
  console.log(
    `Neither works, so ${model} itself has no free-tier quota for this key.\n` +
      "Run `npm run models` and pick a different one — availability in the list does\n" +
      "not guarantee free-tier quota for it.",
  );
}
