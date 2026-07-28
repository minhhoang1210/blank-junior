/**
 * A Discord embed as plain data.
 *
 * Deliberately not `EmbedBuilder`: discord.js accepts plain objects too, and
 * the serverless path has no discord.js at all — so plain data is the only
 * shape both transports can share.
 */
export interface Embed {
  title?: string;
  color?: number;
  author?: { name: string };
  footer?: { text: string };
  fields?: { name: string; value: string; inline?: boolean }[];
}

/** A file sent alongside a reply — currently only the EPUB /epub produces. */
export interface Attachment {
  filename: string;
  data: Uint8Array;
}

/** What a command produced, before it is sent anywhere. */
export interface BotReply {
  text: string;
  embeds: Embed[];
  file?: Attachment;
}

/**
 * How a reply reaches the user.
 *
 * The gateway client edits an interaction; the serverless path PATCHes a
 * webhook. Commands don't care which, so they take one of these instead.
 */
export interface ReplyTransport {
  edit(content: string, embeds: Embed[], file?: Attachment): Promise<void>;
  followUp(content: string): Promise<void>;
}

/** Brand colour used across both commands. */
export const BRAND_COLOUR = 0x4285f4;
