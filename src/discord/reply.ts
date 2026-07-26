import type { ChatInputCommandInteraction } from "discord.js";
import type { Embed, ReplyTransport } from "../core/types.js";

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
    async edit(content: string, embeds: Embed[]): Promise<void> {
      await interaction.editReply({ content, embeds });
    },
    async followUp(content: string): Promise<void> {
      await interaction.followUp({ content });
    },
  };
}
