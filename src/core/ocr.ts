import { type AttachmentRef, fetchImage, uploadNameFor } from "../discord/attachment.js";
import { transcribeImage } from "../gemini/ocr.js";
import { logger } from "../util/logger.js";
import type { CommandJob, ProgressReport } from "./run.js";
import { strings } from "./strings.js";
import { BRAND_COLOUR, type BotReply, type Embed } from "./types.js";

/** `/ocr` as a runnable job. Both transports invoke it through this. */
export function ocrJob(attachment: AttachmentRef, actor?: string): CommandJob {
  return {
    name: "ocr",
    ...(actor ? { actor } : {}),
    build: (report) => readImage(attachment, report),
  };
}

/** Downloads the attachment, transcribes it and formats the reply. */
export async function readImage(
  attachment: AttachmentRef,
  report: ProgressReport,
): Promise<BotReply> {
  report(strings.ocr.reading);

  const image = await fetchImage(attachment);
  const result = await transcribeImage(image);

  // The source image goes back up with the reply rather than being linked at
  // its CDN url, which carries an expiry signature and would leave a broken
  // embed behind within a day. The bytes are already in hand, so this costs one
  // upload and makes the message stand on its own afterwards.
  const filename = uploadNameFor(image.mimeType);

  // Nothing but the picture and one line under it: the filename the user
  // uploaded tells a reader nothing the image itself doesn't.
  const embed: Embed = {
    color: BRAND_COLOUR,
    // Renders full width at the bottom of the embed, directly above the footer.
    // HEIC is the one accepted format browsers won't display; it still uploads,
    // it just shows as a plain attachment rather than a picture.
    image: { url: `attachment://${filename}` },
    footer: { text: strings.ocr.footer },
  };

  logger.info(
    `/ocr read ${attachment.filename} (${image.mimeType}) — ${
      result.empty ? "no text" : `${result.text.length} chars`
    }`,
  );

  // An image with nothing to read is a normal outcome, not a failure, so it
  // answers in place of the transcription rather than raising.
  return {
    text: result.empty ? strings.ocr.noText : result.text,
    embeds: [embed],
    file: { filename, data: image.data, contentType: image.mimeType },
  };
}
