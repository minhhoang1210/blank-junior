import { createHash } from "node:crypto";
import { type DomElement, parseFragment, serializeXhtml } from "./dom.js";
import type { BuildHooks, ImageFetcher } from "./types.js";

const MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

export interface EmbeddedImage {
  id: string;
  path: string;
  mimeType: string;
  data: Uint8Array;
}

export interface EmbedBudget {
  /** Stop downloading once the embedded images total this many bytes. */
  maxBytes: number;
  /** Skip any single image larger than this. */
  maxImageBytes: number;
}

/**
 * Downloads each remote image once and rewrites its `src` to a book-relative
 * path, so the book reads correctly offline. `images` accumulates across calls:
 * an illustration used in several chapters is stored a single time.
 *
 * The budget is what the browser version did not need — a Discord attachment has
 * a hard size ceiling, and an image-heavy story would blow through it long
 * before the text did.
 */
export async function embedImages(
  bodyXhtml: string,
  images: EmbeddedImage[],
  fetchImage: ImageFetcher,
  budget: EmbedBudget,
  hooks: BuildHooks,
): Promise<string> {
  const root = parseFragment(bodyXhtml);
  const targets = Array.from(root.querySelectorAll("img[src]"));
  if (targets.length === 0) return bodyXhtml;

  const byId = new Map(images.map((image) => [image.id, image.path]));
  let used = images.reduce((total, image) => total + image.data.length, 0);

  for (const img of targets) {
    const src = img.getAttribute("src");
    if (!src || !/^https?:/i.test(src)) continue;

    const id = `img-${hashUrl(src)}`;
    const existing = byId.get(id);
    if (existing) {
      img.setAttribute("src", existing);
      continue;
    }

    if (used >= budget.maxBytes) {
      img.remove();
      continue;
    }

    try {
      const { data, mimeType } = await fetchImage(src);
      if (data.length > budget.maxImageBytes || used + data.length > budget.maxBytes) {
        img.remove();
        continue;
      }

      const path = `images/${id}.${MIME_EXTENSIONS[mimeType] ?? "jpg"}`;
      images.push({ id, path, mimeType, data });
      byId.set(id, path);
      used += data.length;
      img.setAttribute("src", path);
    } catch (error) {
      hooks.onWarning?.(`Bỏ qua ảnh: ${error instanceof Error ? error.message : String(error)}`);
      img.remove();
    }
  }

  return Array.from((root as DomElement).childNodes).map(serializeXhtml).join("");
}

/** Short content-addressed id, so the same URL always maps to the same file. */
function hashUrl(url: string): string {
  return createHash("sha1").update(url).digest("hex").slice(0, 16);
}
