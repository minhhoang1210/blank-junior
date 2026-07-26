import { Client, Events, GatewayIntentBits, MessageFlags } from "discord.js";
import { commandsByName } from "./commands/index.js";
import { config } from "./config.js";
import { strings } from "./core/strings.js";
import { logger } from "./util/logger.js";

// MessageContent is a privileged intent and must also be enabled in the
// Developer Portal — without it /tldr reads empty message bodies.
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once(Events.ClientReady, (ready) => {
  logger.info(`Logged in as ${ready.user.tag} — serving ${ready.guilds.cache.size} guild(s)`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = commandsByName.get(interaction.commandName);
  if (!command) {
    logger.warn(`Received unknown command /${interaction.commandName}`);
    return;
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    // Commands handle their own errors; this is the last line of defence so
    // one bad interaction can't take the process down.
    logger.error(`Unhandled error in /${interaction.commandName}`, error);

    const content = strings.commandFailed;
    const respond =
      interaction.deferred || interaction.replied
        ? interaction.followUp({ content, flags: MessageFlags.Ephemeral })
        : interaction.reply({ content, flags: MessageFlags.Ephemeral });

    await respond.catch(() => undefined);
  }
});

client.on(Events.Error, (error) => logger.error("Discord client error", error));

process.on("unhandledRejection", (reason) => logger.error("Unhandled promise rejection", reason));

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    logger.info(`Received ${signal}, shutting down.`);
    void client.destroy().finally(() => process.exit(0));
  });
}

logger.info(`Using Gemini model ${config.geminiModel}`);

client.login(config.discordToken).catch((error: unknown) => {
  logger.error("Failed to log in. Check DISCORD_TOKEN.", error);
  process.exitCode = 1;
});
