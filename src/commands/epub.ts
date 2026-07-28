import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { config } from "../config.js";
import { epubJob } from "../core/epub.js";
import { strings } from "../core/strings.js";
import { guarded, reject } from "./runner.js";

export const data = new SlashCommandBuilder()
  .setName("epub")
  .setDescription(strings.epub.command)
  .addStringOption((option) =>
    option
      .setName("url")
      .setDescription(strings.epub.option)
      .setMinLength(4)
      .setMaxLength(500)
      .setRequired(true),
  );

/** One book per user at a time; each one hits the source site hundreds of times. */
const run = guarded(strings.epub.alreadyRunning);

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const url = interaction.options.getString("url", true).trim();
  if (!url) return reject(interaction, strings.epub.invalidUrl);

  await run(interaction, epubJob(url, config.epubTimeBudgetMs, interaction.user.tag));
}
