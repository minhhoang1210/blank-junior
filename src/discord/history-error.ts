/** Raised when the channel's history can't be read (usually missing permissions). */
export class HistoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HistoryError";
  }
}
