import { formatBytes } from "../util/text.js";
import { AttachmentError } from "./attachment-error.js";

/**
 * Hosts Discord serves attachments from.
 *
 * The URL arrives inside a signature-verified interaction payload, so this is
 * not the SSRF guard `/epub` needs — that command fetches whatever hostname a
 * user typed, this one only ever follows a link Discord itself minted. Checking
 * the host anyway keeps the trust boundary visible instead of implied.
 */
const CDN_HOSTS: ReadonlySet<string> = new Set(["cdn.discordapp.com", "media.discordapp.net"]);

/**
 * Image formats Gemini accepts as an inline part, and the extension each one
 * gets when the file is uploaded back to Discord. One table so the allowlist
 * and the naming cannot drift apart.
 */
const SUPPORTED_TYPES: ReadonlyMap<string, string> = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
  ["image/heic", "heic"],
  ["image/heif", "heif"],
]);

/**
 * Ceiling on the image itself.
 *
 * Inline data shares a request-wide limit of roughly 20 MB, and base64 inflates
 * the bytes by a third on the way — so the raw file has to stay well under it.
 */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/** A Discord attachment, in the shape both transports can produce. */
export interface AttachmentRef {
  url: string;
  filename: string;
  /** Discord sets this for anything it recognises; absent means unknown. */
  contentType?: string;
  size?: number;
}

export interface LoadedImage {
  data: Uint8Array;
  mimeType: string;
}

/** The list shown to a user who attached the wrong thing. */
export const SUPPORTED_TYPE_LABEL = "PNG, JPEG, WebP, HEIC";

/**
 * Checks an attachment without downloading it, so a bad one is refused up front
 * rather than after a deferral. Returns the reason it can't be read, or
 * `undefined` when it can.
 */
export function describeImageProblem(attachment: AttachmentRef): string | undefined {
  let host: string;
  try {
    host = new URL(attachment.url).hostname.toLowerCase();
  } catch {
    return "Discord gửi kèm một liên kết không hợp lệ cho tệp này.";
  }

  if (!CDN_HOSTS.has(host)) {
    return "Tệp này không đến từ kho lưu trữ của Discord nên mình không tải.";
  }

  const mimeType = normaliseType(attachment.contentType);
  if (!mimeType) {
    return `Mình không nhận ra định dạng của tệp này. Hãy đính kèm một ảnh (${SUPPORTED_TYPE_LABEL}).`;
  }
  if (!SUPPORTED_TYPES.has(mimeType)) {
    return `Mình chỉ đọc được ảnh ${SUPPORTED_TYPE_LABEL} — tệp này là \`${mimeType}\`.`;
  }

  if (attachment.size !== undefined && attachment.size > MAX_IMAGE_BYTES) {
    return tooLarge(attachment.size);
  }

  return undefined;
}

/** Downloads an attachment already vetted by `describeImageProblem`. */
export async function fetchImage(attachment: AttachmentRef): Promise<LoadedImage> {
  const problem = describeImageProblem(attachment);
  if (problem) throw new AttachmentError(problem);

  const response = await fetch(attachment.url);
  if (!response.ok) {
    throw new AttachmentError(
      `Mình không tải được ảnh từ Discord (HTTP ${response.status}). Bạn thử gửi lại nhé.`,
    );
  }

  const data = new Uint8Array(await response.arrayBuffer());
  // Discord reports the size in the payload, but the bytes are what actually
  // has to fit in the request — so the real length is checked too.
  if (data.length > MAX_IMAGE_BYTES) throw new AttachmentError(tooLarge(data.length));
  if (data.length === 0) throw new AttachmentError("Tệp ảnh này rỗng.");

  // Vetted above, so the type is known good by here.
  return { data, mimeType: normaliseType(attachment.contentType) as string };
}

/**
 * A plain filename for re-uploading the image alongside the reply.
 *
 * The name is rebuilt rather than reused: an `attachment://` reference has to
 * match the uploaded filename exactly, and the original comes from whatever the
 * user's phone called it — spaces, unicode and a extension that need not agree
 * with the actual bytes. The extension here comes from the vetted media type.
 */
export function uploadNameFor(mimeType: string): string {
  return `anh.${SUPPORTED_TYPES.get(mimeType) ?? "png"}`;
}

/** Strips any `; charset=…` parameter and case, leaving a bare media type. */
function normaliseType(contentType?: string): string | undefined {
  const bare = contentType?.split(";")[0]?.trim().toLowerCase();
  return bare || undefined;
}

function tooLarge(size: number): string {
  return (
    `Ảnh nặng ${formatBytes(size)}, vượt quá giới hạn ${formatBytes(MAX_IMAGE_BYTES)} ` +
    "cho một lần đọc. Bạn thử giảm kích thước rồi gửi lại nhé."
  );
}
