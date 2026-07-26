import "dotenv/config";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. Copy .env.example to .env and fill it in.`,
    );
  }
  return value;
}

function int(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const config = {
  discordToken: required("DISCORD_TOKEN"),
  clientId: required("DISCORD_CLIENT_ID"),
  /** When set, commands register instantly to this guild instead of globally. */
  guildId: process.env.DISCORD_GUILD_ID?.trim() || undefined,

  /**
   * Application **Public Key** from the Developer Portal. Required only by the
   * serverless HTTP-interactions entrypoint, which uses it to verify that
   * requests genuinely came from Discord. The gateway bot doesn't need it.
   */
  discordPublicKey: process.env.DISCORD_PUBLIC_KEY?.trim() || undefined,

  /** Free API key from https://aistudio.google.com/apikey */
  geminiApiKey: required("GEMINI_API_KEY"),
  /**
   * Google retires models on its own schedule, and a retired one keeps working
   * for existing users while returning 404 to newer keys. Run `npm run models`
   * to see what this key can use, and set GEMINI_MODEL accordingly.
   */
  geminiModel: process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash",

  /**
   * Google Search grounding on /ask. It has its own free-tier quota separate
   * from the model's, so turning it off is a lever when that quota is the
   * bottleneck — at the cost of answers to time-sensitive questions.
   */
  enableSearchGrounding: process.env.ENABLE_SEARCH_GROUNDING?.trim().toLowerCase() !== "false",

  /**
   * Language the model writes its answers in. Named in English because that is
   * what the (English) system prompts interpolate it into.
   */
  responseLanguage: process.env.RESPONSE_LANGUAGE?.trim() || "Vietnamese",

  /** Default message count for /tldr when the option is omitted. */
  defaultTldrMessages: int("DEFAULT_TLDR_MESSAGES", 100),
  /** Per-request timeout against the Gemini API, in ms. */
  geminiTimeoutMs: int("GEMINI_TIMEOUT_MS", 120_000),
} as const;

/** Discord's hard limits, referenced in several places. */
export const DISCORD_MESSAGE_LIMIT = 2000;
export const DISCORD_FETCH_BATCH = 100;

/** The /tldr bounds the user asked for. */
export const MIN_TLDR_MESSAGES = 1;
export const MAX_TLDR_MESSAGES = 200;
