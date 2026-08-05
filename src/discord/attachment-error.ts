/** Raised when an uploaded attachment can't be used (wrong type, too big, unreachable). */
export class AttachmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AttachmentError";
  }
}
