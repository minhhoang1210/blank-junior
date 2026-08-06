import type { ChatInputCommandInteraction, SlashCommandOptionsOnlyBuilder } from "discord.js";
import * as chatCommand from "./chat.js";
import * as chooseCommand from "./choose.js";
import * as ocrCommand from "./ocr.js";
import * as tldrCommand from "./tldr.js";

export interface Command {
  data: SlashCommandOptionsOnlyBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

export const commands: Command[] = [tldrCommand, chatCommand, ocrCommand, chooseCommand];

export const commandsByName = new Map(commands.map((command) => [command.data.name, command]));
