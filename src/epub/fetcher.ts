import { lookup } from "node:dns/promises";
import { isIPv4, isIPv6 } from "node:net";
import { EpubError } from "./errors.js";

/**
 * Deliberately honest headers. Spoofing a Chrome user-agent makes WordPress.com's
 * bot protection return 403 — a real browser UA arriving over a non-browser TLS
 * handshake looks more suspicious than an unremarkable client, so the bot
 * identifies itself plainly.
 */
const UPSTREAM_HEADERS = {
  "user-agent": "blank-junior/1.0 (Discord bot; +https://github.com)",
  "accept-language": "vi,en-US;q=0.9,en;q=0.8",
};

const REQUEST_TIMEOUT_MS = 20_000;
const MAX_REDIRECTS = 5;

/** Hostnames that never belong to a public WordPress site. */
const LOCAL_HOSTNAME = /^(localhost|.*\.localhost|.*\.local|.*\.internal|.*\.home\.arpa)$/i;

export interface FetchedDocument {
  html: string;
  /** The post-redirect URL, so relative links resolve against the right page. */
  finalUrl: string;
}

export interface FetchOptions {
  retries?: number;
  signal?: AbortSignal;
}

/**
 * Rejects addresses inside the machine's own network.
 *
 * The URL comes from whoever typed the command, and the bot usually runs on a
 * host that can see a private subnet and a cloud metadata endpoint — so without
 * this the command would be an open relay into them.
 */
function isPrivateAddress(address: string): boolean {
  if (isIPv4(address)) {
    const [a = 0, b = 0] = address.split(".").map(Number);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
    return a >= 224; // multicast and reserved
  }

  const bytes = ipv6Bytes(address.replace(/^\[|]$/g, ""));
  if (!bytes) return false;

  const [b0 = 0, b1 = 0] = bytes;
  // :: and ::1
  if (bytes.every((byte, index) => (index < 15 ? byte === 0 : byte <= 1))) return true;
  if ((b0 & 0xfe) === 0xfc) return true; // fc00::/7 unique-local
  if (b0 === 0xfe && (b1 & 0xc0) === 0x80) return true; // fe80::/10 link-local

  // ::ffff:0:0/96 — an IPv4 address in IPv6 clothing. WHATWG URL parsing
  // re-serialises "::ffff:127.0.0.1" as "::ffff:7f00:1", so this has to be
  // recognised from the bytes rather than from the dotted-quad spelling.
  const isMapped =
    bytes.slice(0, 10).every((byte) => byte === 0) && bytes[10] === 0xff && bytes[11] === 0xff;
  return isMapped ? isPrivateAddress(bytes.slice(12).join(".")) : false;
}

/** Expands an IPv6 literal into its 16 bytes, or null when it is not one. */
function ipv6Bytes(value: string): number[] | null {
  if (!isIPv6(value)) return null;

  // A trailing dotted quad ("::ffff:127.0.0.1") is folded into two hex groups
  // so the rest of this only ever deals with one notation.
  let text = value.toLowerCase();
  const dotted = /(\d{1,3}(?:\.\d{1,3}){3})$/.exec(text)?.[1];
  if (dotted) {
    const [a = 0, b = 0, c = 0, d = 0] = dotted.split(".").map(Number);
    const hex = `${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
    text = text.slice(0, text.length - dotted.length) + hex;
  }

  const [head = "", tail] = text.split("::");
  const left = head.split(":").filter(Boolean);
  const right = tail === undefined ? [] : tail.split(":").filter(Boolean);
  const missing = 8 - left.length - right.length;
  if (tail === undefined ? missing !== 0 : missing < 0) return null;

  return [...left, ...Array<string>(Math.max(0, missing)).fill("0"), ...right].flatMap((group) => {
    const word = Number.parseInt(group, 16);
    return [(word >> 8) & 0xff, word & 0xff];
  });
}

/**
 * Checks one hop of a request chain before it is followed.
 *
 * Resolving the hostname closes the obvious hole in a name-only check: a public
 * domain whose A record points at 127.0.0.1. A name can still be re-resolved
 * between this check and the connection, but that is a much narrower window
 * than accepting the name outright.
 */
async function assertPublicUrl(url: URL): Promise<void> {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new EpubError(`Chỉ hỗ trợ liên kết http/https, không phải \`${url.protocol}\`.`);
  }

  const hostname = url.hostname.replace(/^\[|]$/g, "");
  if (LOCAL_HOSTNAME.test(hostname)) {
    throw new EpubError(`Từ chối truy cập máy chủ nội bộ: \`${hostname}\`.`);
  }

  if (isIPv4(hostname) || hostname.includes(":")) {
    if (isPrivateAddress(hostname)) {
      throw new EpubError(`Từ chối truy cập địa chỉ nội bộ: \`${hostname}\`.`);
    }
    return;
  }

  let addresses: { address: string }[];
  try {
    addresses = await lookup(hostname, { all: true });
  } catch {
    throw new EpubError(`Không phân giải được tên miền \`${hostname}\`.`);
  }

  if (addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw new EpubError(`Từ chối truy cập máy chủ nội bộ: \`${hostname}\`.`);
  }
}

/** Fetches a URL, following redirects by hand so every hop is vetted. */
async function safeFetch(target: string, accept: string, signal?: AbortSignal): Promise<Response> {
  let current = new URL(target);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicUrl(current);

    const response = await fetch(current, {
      headers: { ...UPSTREAM_HEADERS, accept },
      redirect: "manual",
      signal: signal ? AbortSignal.any([signal, timeout()]) : timeout(),
    });

    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      current = new URL(location, current);
      continue;
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText || ""}`.trim());
    }

    // `Response.url` is empty under manual redirects, so the caller is told which
    // URL we actually ended up on.
    Object.defineProperty(response, "resolvedUrl", { value: current.toString() });
    return response;
  }

  throw new Error(`Chuyển hướng quá ${MAX_REDIRECTS} lần: ${target}`);
}

const timeout = () => AbortSignal.timeout(REQUEST_TIMEOUT_MS);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Decodes a page body using the charset the server (or the page itself) declares.
 *
 * `Response.text()` always assumes UTF-8, which turns an older Vietnamese blog
 * served as windows-1258 into mojibake throughout the whole book.
 */
function decodeBody(buffer: ArrayBuffer, contentType: string | null): string {
  const bytes = new Uint8Array(buffer);
  const declared = contentType?.match(/charset=["']?([\w-]+)/i)?.[1];

  // Sniff the document's own declaration when the header is silent; ASCII-safe
  // encodings put it well inside the first kilobyte.
  const head = new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(0, 2048));
  const sniffed =
    head.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1] ??
    head.match(/<meta[^>]+content=["'][^"']*charset=([\w-]+)/i)?.[1];

  const charset = (declared ?? sniffed ?? "utf-8").toLowerCase();
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

/** Fetches a page as text, retrying with exponential backoff on transient failures. */
export async function fetchPage(
  target: string,
  { retries = 2, signal }: FetchOptions = {},
): Promise<FetchedDocument> {
  let lastError: Error = new Error("Chưa thực hiện lần tải nào.");

  for (let attempt = 0; attempt <= retries; attempt++) {
    signal?.throwIfAborted();

    try {
      const response = await safeFetch(target, "text/html,application/xhtml+xml", signal);
      return {
        html: decodeBody(await response.arrayBuffer(), response.headers.get("content-type")),
        finalUrl: (response as Response & { resolvedUrl?: string }).resolvedUrl ?? target,
      };
    } catch (error) {
      // A refused host or a bad scheme will not start working on a retry.
      if (error instanceof EpubError) throw error;
      if (signal?.aborted) throw error;

      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < retries) await sleep(600 * 2 ** attempt);
    }
  }

  throw lastError;
}

/** Fetches a binary asset, used for embedding images into the book. */
export async function fetchBinary(
  target: string,
  signal?: AbortSignal,
): Promise<{ data: Uint8Array; mimeType: string }> {
  const response = await safeFetch(target, "image/*", signal);
  const mimeType = (response.headers.get("content-type") ?? "image/jpeg").split(";")[0]?.trim();

  return {
    data: new Uint8Array(await response.arrayBuffer()),
    mimeType: mimeType || "image/jpeg",
  };
}
