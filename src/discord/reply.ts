import type { ChatInputCommandInteraction } from "discord.js";
import type { Attachment, Embed, ReplyTransport } from "../core/types.js";

/**
 * Reply transport backed by a deferred slash-command interaction.
 *
 * discord.js accepts plain embed objects alongside `EmbedBuilder`, so the core
 * can hand it the same data the serverless path uses.
 */
export function interactionTransport(
  interaction: ChatInputCommandInteraction,
): ReplyTransport {
  return {
    async edit(content: string, embeds: Embed[], file?: Attachment): Promise<void> {
      await interaction.editReply({
        content,
        embeds,
        // Always passed, so a progress edit clears the attachment of a previous
        // one rather than leaving it stuck on the message.
        files: file ? [{ attachment: Buffer.from(file.data), name: file.filename }] : [],
        allowedMentions: NO_MENTIONS,
      });
    },
    async followUp(content: string): Promise<void> {
      await interaction.followUp({ content, allowedMentions: NO_MENTIONS });
    },
  };
}

/**
 * Every reply this bot sends is built from something a user supplied — channel
 * messages, model output, the text inside an uploaded image. Rendering a
 * mention out of any of that would fire with the *bot's* permissions rather
 * than the author's, so an `@everyone` smuggled through one of those routes
 * would ping the whole server.
 */
const NO_MENTIONS = { parse: [] as const };
