import {
  ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import { config, MAX_TLDR_MESSAGES, MIN_TLDR_MESSAGES } from "../config.js";
import { deliver, deliverError, describeError } from "../core/deliver.js";
import { strings } from "../core/strings.js";
import { summariseChannel } from "../core/tldr.js";
import { fetchRecentMessages } from "../discord/history.js";
import { interactionTransport } from "../discord/reply.js";
import { logger } from "../util/logger.js";
import { createJobLock } from "../util/jobs.js";

export const data = new SlashCommandBuilder()
  .setName("tldr")
  .setDescription(strings.tldr.command)
  .addIntegerOption((option) =>
    option
      .setName("messages")
      .setDescription(
        strings.tldr.option(MIN_TLDR_MESSAGES, MAX_TLDR_MESSAGES, config.defaultTldrMessages),
      )
      .setMinValue(MIN_TLDR_MESSAGES)
      .setMaxValue(MAX_TLDR_MESSAGES)
      .setRequired(false),
  );

/** One summary per user at a time; each one costs a full model call. */
const lock = createJobLock();

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const channel = interaction.channel;
  if (!channel?.isTextBased()) {
    await interaction.reply({
      content: strings.tldr.textChannelsOnly,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (lock.isBusy(interaction.user.id)) {
    await interaction.reply({
      content: strings.tldr.alreadyRunning,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const requested = interaction.options.getInteger("messages") ?? config.defaultTldrMessages;
  const channelName = "name" in channel && channel.name ? channel.name : undefined;
  const transport = interactionTransport(interaction);

  await lock.run(interaction.user.id, async () => {
    await interaction.deferReply();

    try {
      const reply = await summariseChannel(
        (limit) => fetchRecentMessages(channel, limit, interaction.client.user.id),
        requested,
        channelName,
      );
      await deliver(transport, reply);
    } catch (error) {
      logger.error(`/tldr failed for ${interaction.user.tag}: ${describeError(error)}`);
      await deliverError(transport, error);
    }
  });
}
