import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { askJob } from "../core/ask.js";
import { strings } from "../core/strings.js";
import { guarded, reject } from "./runner.js";

export const data = new SlashCommandBuilder()
  .setName("ask")
  .setDescription(strings.ask.command)
  .addStringOption((option) =>
    option
      .setName("question")
      .setDescription(strings.ask.option)
      .setMinLength(2)
      .setMaxLength(1000)
      .setRequired(true),
  );

/** One question per user at a time. */
const run = guarded(strings.ask.alreadyRunning);

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const question = interaction.options.getString("question", true).trim();
  if (!question) return reject(interaction, strings.ask.blankQuestion);

  await run(interaction, askJob(question, interaction.user.tag));
}
