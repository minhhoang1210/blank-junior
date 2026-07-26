import { REST, Routes } from "discord.js";
import { commands } from "./commands/index.js";
import { config } from "./config.js";
import { logger } from "./util/logger.js";

/**
 * Registers the slash commands with Discord.
 *
 * Guild-scoped registration (DISCORD_GUILD_ID set) applies immediately and is
 * what you want while developing. Global registration can take up to an hour
 * to propagate.
 */
async function main(): Promise<void> {
  const rest = new REST({ version: "10" }).setToken(config.discordToken);
  const body = commands.map((command) => command.data.toJSON());

  const route = config.guildId
    ? Routes.applicationGuildCommands(config.clientId, config.guildId)
    : Routes.applicationCommands(config.clientId);

  await rest.put(route, { body });

  logger.info(
    `Registered ${body.length} command(s) ${config.guildId ? `to guild ${config.guildId}` : "globally"}: ${body
      .map((command) => `/${command.name}`)
      .join(", ")}`,
  );
}

main().catch((error: unknown) => {
  logger.error("Failed to register commands", error);
  process.exitCode = 1;
});
