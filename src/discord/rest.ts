import { config } from "../config.js";
import { logger } from "../util/logger.js";

const API = "https://discord.com/api/v10";

export class DiscordRestError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "DiscordRestError";
    this.status = status;
  }
}

/** A Discord message as returned by the REST API, narrowed to what we read. */
export interface RawMessage {
  id: string;
  content: string;
  timestamp: string;
  author: { id: string; bot?: boolean; username: string; global_name?: string | null };
  member?: { nick?: string | null } | null;
  mentions?: { id: string; username: string; global_name?: string | null }[];
  attachments?: unknown[];
  embeds?: unknown[];
}

/**
 * Minimal Discord REST call with one retry on rate limit.
 *
 * The serverless entrypoint has a hard time budget, so this deliberately does
 * not implement full bucket-aware rate limiting — it honours `retry_after`
 * once and otherwise fails fast.
 */
async function request<T>(
  method: "GET" | "POST" | "PATCH",
  path: string,
  options: { body?: unknown; form?: FormData; auth?: string } = {},
): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch(`${API}${path}`, {
      method,
      headers: {
        ...(options.auth === undefined ? { Authorization: `Bot ${config.discordToken}` } : {}),
        // fetch writes the multipart content-type itself, boundary included;
        // setting one here would send a body Discord cannot parse.
        ...(options.form === undefined ? { "Content-Type": "application/json" } : {}),
        "User-Agent": "DiscordBot (blank-junior, 1.0.0)",
      },
      ...(options.form !== undefined
        ? { body: options.form }
        : options.body === undefined
          ? {}
          : { body: JSON.stringify(options.body) }),
    });

    if (response.status === 429 && attempt === 0) {
      const retry = (await response.json().catch(() => ({}))) as { retry_after?: number };
      const waitMs = Math.min((retry.retry_after ?? 1) * 1000, 5000);
      logger.warn(`Discord rate limit on ${path}; waiting ${waitMs}ms`);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      continue;
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new DiscordRestError(
        response.status,
        `Discord ${method} ${path} failed (${response.status}): ${detail.slice(0, 200)}`,
      );
    }

    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  throw new DiscordRestError(429, `Discord ${method} ${path} stayed rate limited.`);
}

/**
 * Reads a channel's metadata, used only to put its name on the summary.
 *
 * The interaction payload usually carries the name already, so this is the
 * fallback for when it doesn't.
 */
export function fetchChannel(channelId: string): Promise<{ name?: string | null }> {
  return request<{ name?: string | null }>("GET", `/channels/${channelId}`);
}

export function fetchChannelMessages(
  channelId: string,
  query: { limit: number; before?: string },
): Promise<RawMessage[]> {
  const params = new URLSearchParams({ limit: String(query.limit) });
  if (query.before) params.set("before", query.before);
  return request<RawMessage[]>("GET", `/channels/${channelId}/messages?${params}`);
}

/**
 * Replaces the "thinking…" placeholder created by the deferred response.
 *
 * Uses the interaction token rather than the bot token, which is why no
 * Authorization header is sent.
 */
export function editOriginalResponse(
  interactionToken: string,
  body: { content?: string; embeds?: unknown[] },
  file?: { filename: string; data: Uint8Array },
): Promise<unknown> {
  const path = `/webhooks/${config.clientId}/${interactionToken}/messages/@original`;
  if (!file) return request("PATCH", path, { body, auth: "none" });

  // Attachments go up as multipart: the JSON payload names the file by index,
  // and `files[0]` carries the bytes it refers to.
  const form = new FormData();
  form.append(
    "payload_json",
    JSON.stringify({ ...body, attachments: [{ id: 0, filename: file.filename }] }),
  );
  form.append(
    "files[0]",
    new Blob([file.data], { type: "application/epub+zip" }),
    file.filename,
  );

  return request("PATCH", path, { form, auth: "none" });
}

/** Sends an additional message on the same interaction, for long replies. */
export function createFollowup(
  interactionToken: string,
  body: { content: string },
): Promise<unknown> {
  return request("POST", `/webhooks/${config.clientId}/${interactionToken}`, {
    body,
    auth: "none",
  });
}
