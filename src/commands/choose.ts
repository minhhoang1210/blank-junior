import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { chooseCommand, MAX_CHOICES, MIN_CHOICES, parseChoices } from "../core/choose.js";
import { strings } from "../core/strings.js";
import { reject } from "./runner.js";

export const data = new SlashCommandBuilder()
  .setName("choose")
  .setDescription(strings.choose.command)
  .addStringOption((option) =>
    option
      .setName("options")
      .setDescription(strings.choose.option)
      // The shortest meaningful input is `a|b`.
      .setMinLength(3)
      .setMaxLength(500)
      .setRequired(true),
  );

/**
 * Answers directly instead of going through `guarded`.
 *
 * There is no I/O to wait on, so deferring would only flash a "thinking…"
 * placeholder before an answer that was already ready, and a draw costs nothing
 * worth serialising one-per-user.
 */
export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const choices = parseChoices(interaction.options.getString("options", true));
  if (choices.length < MIN_CHOICES) return reject(interaction, strings.choose.tooFew);
  if (choices.length > MAX_CHOICES) {
    return reject(interaction, strings.choose.tooMany(MAX_CHOICES));
  }

  const reply = chooseCommand(choices);
  await interaction.reply({
    content: reply.text,
    embeds: reply.embeds,
    // The options are the user's own text echoed back, so an `@everyone` in one
    // of them would ping the whole server through the bot without this.
    allowedMentions: { parse: [] },
  });
}
