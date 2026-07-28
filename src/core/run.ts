import { logger } from "../util/logger.js";
import { deliver, deliverError, describeError } from "./deliver.js";
import type { BotReply, ReplyTransport } from "./types.js";

/**
 * Posts an interim status while a slow command works. Commands that finish in
 * one call ignore it.
 */
export type ProgressReport = (message: string) => void;

/**
 * One unit of work, described independently of how it was invoked.
 *
 * The bot answers the same commands over two transports — a gateway
 * interaction and a webhook — and before this existed each one carried its own
 * copy of "call the core function, deliver the reply, log and report failures".
 * A job says what to do; `runCommand` owns everything around it.
 */
export interface CommandJob {
  /** Command name, for log lines. */
  name: string;
  /** Who asked. The serverless path has no user object, hence optional. */
  actor?: string;
  build: (report: ProgressReport) => Promise<BotReply>;
}

/** Runs a job and delivers whatever it produced, including its failures. */
export async function runCommand(transport: ReplyTransport, job: CommandJob): Promise<void> {
  const progress = progressReporter(transport);

  try {
    const reply = await job.build(progress.report);
    // Drained before the reply lands: a straggling status edit arriving after
    // it would overwrite the message, taking any attachment with it.
    await progress.stop();
    await deliver(transport, reply);
  } catch (error) {
    await progress.stop();
    logger.error(
      `/${job.name} failed${job.actor ? ` for ${job.actor}` : ""}: ${describeError(error)}`,
    );
    await deliverError(transport, error);
  }
}

export interface ProgressReporter {
  report: ProgressReport;
  /** Stops further updates and waits for any in-flight edit to land. */
  stop(): Promise<void>;
}

/**
 * Wraps a transport in a throttled status reporter.
 *
 * A book is minutes of work, so the placeholder message is kept moving — but
 * Discord rate-limits edits, and one per chapter would trip it immediately.
 * Updates are chained rather than fired in parallel so they cannot land out of
 * order.
 */
export function progressReporter(transport: ReplyTransport): ProgressReporter {
  const INTERVAL_MS = 5_000;
  let last = 0;
  let stopped = false;
  let inFlight: Promise<void> = Promise.resolve();

  return {
    report(message: string): void {
      if (stopped) return;

      const now = Date.now();
      if (now - last < INTERVAL_MS) return;
      last = now;

      // A dropped progress update must not fail the job it is reporting on.
      inFlight = inFlight.then(() => transport.edit(message, []).catch(() => undefined));
    },

    async stop(): Promise<void> {
      stopped = true;
      await inFlight;
    },
  };
}
