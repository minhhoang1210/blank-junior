/**
 * Raised when a story cannot be turned into a book — a bad URL, an unreachable
 * site, a page with no chapters on it.
 *
 * The message is already user-facing Vietnamese, so `toUserMessage` passes it
 * straight through instead of falling back to a generic failure notice.
 */
export class EpubError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EpubError";
  }
}
