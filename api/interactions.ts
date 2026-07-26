import { waitUntil } from "@vercel/functions";
import { handleInteraction } from "../src/http/interactions.js";

/**
 * Vercel entrypoint for Discord's interactions webhook.
 *
 * Kept as thin as possible: all logic lives in `src/http/interactions.ts`, so
 * if a different runtime or handler signature is ever needed, only this file
 * changes.
 *
 * `request.text()` is what makes signature verification possible — Discord
 * signs the exact bytes it sent, and re-serialising parsed JSON would not
 * reproduce them.
 */
export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text();

  const result = await handleInteraction(
    rawBody,
    request.headers.get("x-signature-ed25519") ?? undefined,
    request.headers.get("x-signature-timestamp") ?? undefined,
  );

  // The response returns immediately; waitUntil keeps the invocation alive so
  // the model call can finish and edit the placeholder message afterwards.
  if (result.background) waitUntil(result.background());

  return new Response(JSON.stringify(result.json), {
    status: result.status,
    headers: { "content-type": "application/json" },
  });
}

/** Browsers and uptime checks hitting the URL directly get something sane. */
export function GET(): Response {
  return new Response("Discord interactions endpoint. POST only.", {
    status: 405,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
