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
      });
    },
    async followUp(content: string): Promise<void> {
      await interaction.followUp({ content });
    },
  };
}
