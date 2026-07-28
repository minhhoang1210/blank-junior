import { type ChatInputCommandInteraction, MessageFlags } from "discord.js";
import { runCommand, type CommandJob } from "../core/run.js";
import { interactionTransport } from "../discord/reply.js";
import { createJobLock } from "../util/jobs.js";

/**
 * The gateway wrapper every command shares: refuse a second concurrent job from
 * the same user, acknowledge inside Discord's 3-second window, then run.
 *
 * Each command calls this with its own lock, so a user waiting on a book can
 * still ask a question.
 */
export function guarded(busyMessage: string) {
  const lock = createJobLock();

  return async function run(
    interaction: ChatInputCommandInteraction,
    job: CommandJob,
  ): Promise<void> {
    if (lock.isBusy(interaction.user.id)) {
      await interaction.reply({ content: busyMessage, flags: MessageFlags.Ephemeral });
      return;
    }

    await lock.run(interaction.user.id, async () => {
      await interaction.deferReply();
      await runCommand(interactionTransport(interaction), job);
    });
  };
}

/** An immediate, private reply — used for input errors only. */
export async function reject(
  interaction: ChatInputCommandInteraction,
  content: string,
): Promise<void> {
  await interaction.reply({ content, flags: MessageFlags.Ephemeral });
}
