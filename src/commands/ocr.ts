import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { ocrJob } from "../core/ocr.js";
import { strings } from "../core/strings.js";
import { type AttachmentRef, describeImageProblem } from "../discord/attachment.js";
import { guarded, reject } from "./runner.js";

export const data = new SlashCommandBuilder()
  .setName("ocr")
  .setDescription(strings.ocr.command)
  .addAttachmentOption((option) =>
    option.setName("image").setDescription(strings.ocr.option).setRequired(true),
  );

/** One image per user at a time; each one is a full model call. */
const run = guarded(strings.ocr.alreadyRunning);

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const image = interaction.options.getAttachment("image", true);
  const attachment: AttachmentRef = {
    url: image.url,
    filename: image.name,
    ...(image.contentType ? { contentType: image.contentType } : {}),
    ...(image.size ? { size: image.size } : {}),
  };

  // Vetted before deferring, so "that isn't an image" stays a private one-liner
  // instead of replacing a "thinking…" placeholder half a second later.
  const problem = describeImageProblem(attachment);
  if (problem) return reject(interaction, problem);

  await run(interaction, ocrJob(attachment, interaction.user.tag));
}
