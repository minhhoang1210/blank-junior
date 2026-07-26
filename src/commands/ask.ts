import {
  ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import { answerCommand } from "../core/ask.js";
import { deliver, deliverError, describeError } from "../core/deliver.js";
import { strings } from "../core/strings.js";
import { interactionTransport } from "../discord/reply.js";
import { logger } from "../util/logger.js";
import { createJobLock } from "../util/jobs.js";

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
const lock = createJobLock();

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const question = interaction.options.getString("question", true).trim();

  if (!question) {
    await interaction.reply({
      content: strings.ask.blankQuestion,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (lock.isBusy(interaction.user.id)) {
    await interaction.reply({
      content: strings.ask.alreadyRunning,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const transport = interactionTransport(interaction);

  await lock.run(interaction.user.id, async () => {
    await interaction.deferReply();

    try {
      await deliver(transport, await answerCommand(question));
    } catch (error) {
      logger.error(`/ask failed for ${interaction.user.tag}: ${describeError(error)}`);
      await deliverError(transport, error);
    }
  });
}
