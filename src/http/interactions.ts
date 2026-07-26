import { config } from "../config.js";
import { strings } from "../core/strings.js";
import { logger } from "../util/logger.js";
import { runAsk, runTldr } from "./commands.js";
import { verifyDiscordRequest } from "./verify.js";

/** Discord interaction types we handle. */
const enum InteractionType {
  Ping = 1,
  ApplicationCommand = 2,
}

/** Discord interaction callback types we send. */
const enum CallbackType {
  Pong = 1,
  ChannelMessage = 4,
  DeferredChannelMessage = 5,
}

interface CommandOption {
  name: string;
  value?: string | number | boolean;
}

interface Interaction {
  type: number;
  token: string;
  channel_id?: string;
  /** Partial channel object; present on modern API versions, hence optional. */
  channel?: { id?: string; name?: string | null };
  data?: { name?: string; options?: CommandOption[] };
}

export interface InteractionResult {
  status: number;
  json: unknown;
  /**
   * Work to run *after* the response is sent. The caller must keep the
   * invocation alive for it (on Vercel, `waitUntil`).
   */
  background?: () => Promise<void>;
}

const BAD_SIGNATURE: InteractionResult = {
  status: 401,
  json: { error: "invalid request signature" },
};

/**
 * Handles one inbound Discord interaction.
 *
 * Deliberately transport-agnostic — it takes the raw body and the two signature
 * headers and returns what to send back — so the Vercel entrypoint stays a thin
 * adapter and this stays unit-testable without a server.
 */
export async function handleInteraction(
  rawBody: string,
  signature: string | undefined,
  timestamp: string | undefined,
): Promise<InteractionResult> {
  if (!config.discordPublicKey) {
    logger.error("DISCORD_PUBLIC_KEY is not set; cannot verify Discord requests.");
    return { status: 500, json: { error: "server misconfigured" } };
  }

  if (!verifyDiscordRequest(config.discordPublicKey, signature, timestamp, rawBody)) {
    return BAD_SIGNATURE;
  }

  let interaction: Interaction;
  try {
    interaction = JSON.parse(rawBody) as Interaction;
  } catch {
    return { status: 400, json: { error: "malformed body" } };
  }

  // Discord validates a new endpoint by sending a PING it expects a PONG for.
  if (interaction.type === InteractionType.Ping) {
    return { status: 200, json: { type: CallbackType.Pong } };
  }

  if (interaction.type !== InteractionType.ApplicationCommand) {
    return { status: 200, json: { type: CallbackType.Pong } };
  }

  return routeCommand(interaction);
}

function routeCommand(interaction: Interaction): InteractionResult {
  const name = interaction.data?.name;
  const token = interaction.token;

  // Discord drops the interaction unless it is acknowledged within 3 seconds,
  // and neither command finishes that fast — so acknowledge now and edit the
  // placeholder once the real work is done.
  const deferred: InteractionResult = {
    status: 200,
    json: { type: CallbackType.DeferredChannelMessage },
  };

  if (name === "tldr") {
    const channelId = interaction.channel_id;
    if (!channelId) return reply(strings.tldr.textChannelsOnly);

    // Bounds are applied by the command itself, so this only has to pick a
    // number: whatever the user supplied, or the configured default.
    const raw = optionValue(interaction, "messages");
    const requested = typeof raw === "number" ? raw : config.defaultTldrMessages;
    const channelName = interaction.channel?.name ?? undefined;

    return {
      ...deferred,
      background: () => runTldr(token, channelId, requested, channelName),
    };
  }

  if (name === "ask") {
    const question = String(optionValue(interaction, "question") ?? "").trim();
    if (!question) return reply(strings.ask.blankQuestion);

    return { ...deferred, background: () => runAsk(token, question) };
  }

  logger.warn(`Received unknown command /${name ?? "(none)"}`);
  return reply(strings.unknownCommand);
}

/** An immediate, non-deferred reply — used for input errors only. */
function reply(content: string): InteractionResult {
  return {
    status: 200,
    json: { type: CallbackType.ChannelMessage, data: { content, flags: 1 << 6 } },
  };
}

function optionValue(interaction: Interaction, name: string): string | number | boolean | undefined {
  return interaction.data?.options?.find((option) => option.name === name)?.value;
}
