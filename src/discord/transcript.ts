/**
 * The parts of a Discord message the summary needs, independent of how the
 * message was obtained — gateway client or raw REST.
 */
export interface CapturedMessage {
  id: string;
  author: string;
  isBot: boolean;
  createdAt: Date;
  content: string;
  attachments: number;
}

/** Individual messages are clipped so one wall of text can't crowd out the rest. */
export const MAX_MESSAGE_CHARS = 1500;
/** Overall transcript ceiling; oldest messages are dropped first. */
export const MAX_TRANSCRIPT_CHARS = 120_000;

export function clipContent(content: string): string {
  return content.length > MAX_MESSAGE_CHARS
    ? `${content.slice(0, MAX_MESSAGE_CHARS)}…`
    : content;
}

/**
 * Renders messages as a transcript. If the result would exceed the character
 * ceiling, the oldest lines are dropped and a marker is prepended.
 */
export function buildTranscript(messages: readonly CapturedMessage[]): string {
  const lines = messages.map((message) => {
    const stamp = formatStamp(message.createdAt);
    const label = message.isBot ? `${message.author} [bot]` : message.author;
    const note =
      message.attachments > 0
        ? ` <${message.attachments} attachment${message.attachments === 1 ? "" : "s"}>`
        : "";
    return `[${stamp}] ${label}: ${message.content}${note}`;
  });

  let total = lines.reduce((sum, line) => sum + line.length + 1, 0);
  let start = 0;
  while (total > MAX_TRANSCRIPT_CHARS && start < lines.length) {
    total -= (lines[start] as string).length + 1;
    start++;
  }

  const kept = lines.slice(start);
  // Kept in English: this marker is read by the model, not the user.
  return start > 0
    ? `[…${start} older message${start === 1 ? "" : "s"} omitted for length…]\n${kept.join("\n")}`
    : kept.join("\n");
}

function formatStamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}
