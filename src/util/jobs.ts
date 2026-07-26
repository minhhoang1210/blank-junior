/**
 * Serialises work per user, so one person can't queue up model calls by
 * spamming a command. Each command owns its own lock.
 */
export function createJobLock() {
  const active = new Set<string>();

  return {
    isBusy: (userId: string): boolean => active.has(userId),

    /** Runs `task`, holding the lock until it settles. */
    async run(userId: string, task: () => Promise<void>): Promise<void> {
      active.add(userId);
      try {
        await task();
      } finally {
        active.delete(userId);
      }
    },
  };
}
