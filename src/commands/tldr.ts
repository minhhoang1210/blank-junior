import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { config, MAX_TLDR_MESSAGES, MIN_TLDR_MESSAGES } from "../config.js";
import { strings } from "../core/strings.js";
import { tldrJob } from "../core/tldr.js";
import { fetchRecentMessages } from "../discord/history.js";
import { guarded, reject } from "./runner.js";

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
const run = guarded(strings.tldr.alreadyRunning);

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const channel = interaction.channel;
  if (!channel?.isTextBased()) return reject(interaction, strings.tldr.textChannelsOnly);

  const requested = interaction.options.getInteger("messages") ?? config.defaultTldrMessages;

  await run(
    interaction,
    tldrJob(
      {
        fetchMessages: (limit) =>
          fetchRecentMessages(channel, limit, interaction.client.user.id),
        requested,
        // The gateway already holds the channel object, so no extra call is needed.
        ...("name" in channel && channel.name ? { channelName: channel.name } : {}),
      },
      interaction.user.tag,
    ),
  );
}
