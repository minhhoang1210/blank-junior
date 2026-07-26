import type { ChatInputCommandInteraction, SlashCommandOptionsOnlyBuilder } from "discord.js";
import * as askCommand from "./ask.js";
import * as tldrCommand from "./tldr.js";

export interface Command {
  data: SlashCommandOptionsOnlyBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

export const commands: Command[] = [tldrCommand, askCommand];

export const commandsByName = new Map(commands.map((command) => [command.data.name, command]));
