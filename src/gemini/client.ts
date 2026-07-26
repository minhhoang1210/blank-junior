import { ApiError, FinishReason, GoogleGenAI, type GenerateContentResponse } from "@google/genai";
import { config } from "../config.js";
import { logger } from "../util/logger.js";

/** The model both commands run on. Overridable via GEMINI_MODEL. */
export const MODEL = config.geminiModel;

/**
 * Output ceiling. On Gemini 2.5 models thinking tokens count toward this, so it
 * is set well above the length any reply actually needs.
 */
export const MAX_OUTPUT_TOKENS = 16384;

export const genai = new GoogleGenAI({
  apiKey: config.geminiApiKey,
  httpOptions: { timeout: config.geminiTimeoutMs },
});

/** Finish reasons that mean the model stopped rather than answered. */
const BLOCKING_REASONS: ReadonlySet<string> = new Set([
  FinishReason.SAFETY,
  FinishReason.PROHIBITED_CONTENT,
  FinishReason.BLOCKLIST,
  FinishReason.SPII,
  FinishReason.RECITATION,
  FinishReason.IMAGE_SAFETY,
  FinishReason.IMAGE_PROHIBITED_CONTENT,
]);

/** Raised when a safety filter stopped the prompt or the response. */
export class GeminiBlockedError extends Error {
  readonly reason: string;

  constructor(reason: string, where: "prompt" | "response") {
    super(
      where === "prompt"
        ? `Bộ lọc an toàn của Gemini đã chặn yêu cầu này (${reason}). Bạn thử diễn đạt lại xem sao.`
        : `Bộ lọc an toàn của Gemini đã chặn câu trả lời (${reason}). Bạn thử hỏi lại theo cách khác nhé.`,
    );
    this.name = "GeminiBlockedError";
    this.reason = reason;
  }
}

/** Raised when a response came back with no usable text. */
export class EmptyResponseError extends Error {
  constructor(detail?: string) {
    super(
      detail
        ? `Gemini không trả về nội dung nào (${detail}).`
        : "Gemini trả về phản hồi trống. Bạn thử lại sau ít phút nhé.",
    );
    this.name = "EmptyResponseError";
  }
}

/**
 * Pulls the answer text out of a response.
 *
 * Blocks are checked before the text: a filtered prompt or response comes back
 * as a normal 200 with an empty candidate, so reading `.text` first would just
 * look like an unexplained blank reply.
 */
export function extractText(response: GenerateContentResponse): string {
  const blockReason = response.promptFeedback?.blockReason;
  if (blockReason) throw new GeminiBlockedError(String(blockReason), "prompt");

  const candidate = response.candidates?.[0];
  const finishReason = candidate?.finishReason;

  if (finishReason && BLOCKING_REASONS.has(finishReason)) {
    throw new GeminiBlockedError(String(finishReason), "response");
  }

  const text = response.text?.trim();

  if (!text) {
    // Thinking tokens share the output budget, so a low ceiling can be spent
    // before any visible text is produced.
    if (finishReason === FinishReason.MAX_TOKENS) {
      throw new EmptyResponseError("đã hết hạn mức đầu ra trước khi viết được gì");
    }
    throw new EmptyResponseError(finishReason ? `lý do dừng: ${finishReason}` : undefined);
  }

  return text;
}

/**
 * Logs what a call actually consumed.
 *
 * Free-tier limits are enforced on tokens per minute as well as requests, so
 * these numbers are the only way to know which command is eating the quota.
 */
export function logUsage(label: string, response: GenerateContentResponse): void {
  const usage = response.usageMetadata;
  if (!usage) return;

  const parts = [
    `prompt=${usage.promptTokenCount ?? 0}`,
    usage.thoughtsTokenCount ? `thinking=${usage.thoughtsTokenCount}` : undefined,
    `output=${usage.candidatesTokenCount ?? 0}`,
    usage.toolUsePromptTokenCount ? `search=${usage.toolUsePromptTokenCount}` : undefined,
    `total=${usage.totalTokenCount ?? 0}`,
  ].filter(Boolean);

  logger.info(`${label} tokens — ${parts.join(", ")}`);
}

/**
 * Digs the server's suggested wait out of a quota error.
 *
 * Google sometimes attaches a `RetryInfo` detail and sometimes only a help
 * link, so this is best-effort and the caller must cope with `undefined`.
 */
function retryDelayFrom(error: ApiError): string | undefined {
  try {
    const parsed = JSON.parse(error.message) as {
      error?: { details?: { "@type"?: string; retryDelay?: string }[] };
    };
    const info = parsed.error?.details?.find((detail) =>
      detail["@type"]?.endsWith("RetryInfo"),
    );
    return info?.retryDelay;
  } catch {
    return undefined;
  }
}

/** True when the reply was cut off at the output limit. */
export function wasTruncated(response: GenerateContentResponse): boolean {
  return response.candidates?.[0]?.finishReason === FinishReason.MAX_TOKENS;
}

/** Turns an SDK error into something worth showing in Discord. */
export function describeGeminiError(error: unknown): string {
  if (error instanceof GeminiBlockedError || error instanceof EmptyResponseError) {
    return error.message;
  }

  if (error instanceof ApiError) {
    if (error.status === 429) {
      const delay = retryDelayFrom(error);
      return (
        `Hạn mức miễn phí của Gemini đã hết${delay ? ` — thử lại sau ${delay}` : ""}. ` +
        "Key miễn phí bị giới hạn theo phút *và* theo ngày; nếu đợi một lát vẫn không được " +
        "thì hạn mức trong ngày đã dùng hết và sẽ đặt lại theo lịch của Google. Xem " +
        "<https://aistudio.google.com/rate-limit> để biết giới hạn nào đã chạm."
      );
    }
    if (error.status === 404) {
      // Retired models keep working for existing users but 404 for new keys,
      // so the fix is always "pick one this key can actually see".
      return (
        `Gemini không có model nào tên \`${MODEL}\` khả dụng với API key này — có thể nó đã ` +
        "ngừng được hỗ trợ. Chạy `npm run models` trên máy chủ để xem các model dùng được, " +
        "rồi đặt `GEMINI_MODEL` trong `.env` thành một trong số đó."
      );
    }
    if (error.status === 401 || error.status === 403) {
      return "Gemini từ chối API key. Hãy kiểm tra `GEMINI_API_KEY` trên máy chủ.";
    }
    if (error.status === 400) {
      return "Gemini từ chối yêu cầu. Có thể nội dung quá dài — bạn thử với ít tin nhắn hơn.";
    }
    if (error.status >= 500) {
      return "Gemini đang gặp sự cố. Bạn thử lại sau ít phút nhé.";
    }
    return `Gemini trả về lỗi (HTTP ${error.status}). Bạn thử lại sau ít phút nhé.`;
  }

  return "Có lỗi khi kết nối tới Gemini. Bạn thử lại sau ít phút nhé.";
}
