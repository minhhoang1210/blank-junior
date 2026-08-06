import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { chatJob } from "../core/chat.js";
import { strings } from "../core/strings.js";
import { guarded, reject } from "./runner.js";

export const data = new SlashCommandBuilder()
  .setName("chat")
  .setDescription(strings.chat.command)
  .addStringOption((option) =>
    option
      .setName("message")
      .setDescription(strings.chat.option)
      .setMinLength(2)
      .setMaxLength(1000)
      .setRequired(true),
  );

/** One message per user at a time. */
const run = guarded(strings.chat.alreadyRunning);

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const message = interaction.options.getString("message", true).trim();
  if (!message) return reject(interaction, strings.chat.blankMessage);

  await run(interaction, chatJob(message, interaction.user.tag));
}
