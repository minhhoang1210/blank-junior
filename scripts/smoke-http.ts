/**
 * Offline tests for the serverless HTTP-interactions path.
 *
 *   npm run smoke:http
 *
 * Env is stubbed *before* any src import, because config.ts reads it at module
 * load; the src modules are then pulled in dynamically. Nothing here touches
 * the network — background work returned by the handler is asserted to exist
 * but deliberately never invoked.
 */
import { generateKeyPairSync, sign } from "node:crypto";

// Real Ed25519 keypair, so signature verification is exercised for real.
const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const der = publicKey.export({ format: "der", type: "spki" }) as Buffer;
const publicKeyHex = der.subarray(der.length - 32).toString("hex");

process.env.DISCORD_TOKEN ??= "test-token";
process.env.DISCORD_CLIENT_ID ??= "123456789";
process.env.GEMINI_API_KEY ??= "test-key";
process.env.DISCORD_PUBLIC_KEY = publicKeyHex;

const { verifyDiscordRequest } = await import("../src/http/verify.js");
const { handleInteraction } = await import("../src/http/interactions.js");
const { check, checkThat, report } = await import("./harness.js");

function signBody(body: string, timestamp = "1700000000"): string {
  return sign(null, Buffer.from(timestamp + body, "utf8"), privateKey).toString("hex");
}

// --- Signature verification -------------------------------------------------
console.log("--- Signature verification");

const body = JSON.stringify({ type: 1 });
const timestamp = "1700000000";
const signature = signBody(body, timestamp);

check("accepts a genuine signature", verifyDiscordRequest(publicKeyHex, signature, timestamp, body), true);
check(
  "rejects a tampered body",
  verifyDiscordRequest(publicKeyHex, signature, timestamp, JSON.stringify({ type: 2 })),
  false,
);
check(
  "rejects a replayed timestamp",
  verifyDiscordRequest(publicKeyHex, signature, "1700000001", body),
  false,
);
check(
  "rejects a signature from a different key",
  verifyDiscordRequest(publicKeyHex, signBodyWithOtherKey(body, timestamp), timestamp, body),
  false,
);
check("rejects a missing signature", verifyDiscordRequest(publicKeyHex, undefined, timestamp, body), false);
check("rejects a missing timestamp", verifyDiscordRequest(publicKeyHex, signature, undefined, body), false);
check("rejects non-hex garbage", verifyDiscordRequest(publicKeyHex, "zzzz", timestamp, body), false);
check("rejects a wrong-length signature", verifyDiscordRequest(publicKeyHex, "ab12", timestamp, body), false);
check("rejects a malformed public key", verifyDiscordRequest("00", signature, timestamp, body), false);

function signBodyWithOtherKey(payload: string, ts: string): string {
  const other = generateKeyPairSync("ed25519");
  return sign(null, Buffer.from(ts + payload, "utf8"), other.privateKey).toString("hex");
}

// --- Interaction routing ----------------------------------------------------
console.log("\n--- Interaction routing");

async function post(payload: unknown, options: { corrupt?: boolean } = {}) {
  const raw = JSON.stringify(payload);
  const ts = "1700000000";
  const sig = options.corrupt ? signBody("something else", ts) : signBody(raw, ts);
  return handleInteraction(raw, sig, ts);
}

const ping = await post({ type: 1 });
check("PING is answered with PONG", ping.json, { type: 1 });
check("PING returns 200", ping.status, 200);
checkThat("PING schedules no background work", ping.background === undefined);

const forged = await post({ type: 1 }, { corrupt: true });
check("a forged signature is rejected with 401", forged.status, 401);

const tldr = await post({
  type: 2,
  token: "tok",
  channel_id: "555",
  data: { name: "tldr", options: [{ name: "messages", value: 200 }] },
});
check("/tldr defers", tldr.json, { type: 5 });
checkThat("/tldr schedules background work", typeof tldr.background === "function");

const tldrDefault = await post({ type: 2, token: "tok", channel_id: "555", data: { name: "tldr" } });
check("/tldr without options still defers", tldrDefault.json, { type: 5 });
checkThat("/tldr without options schedules work", typeof tldrDefault.background === "function");

const ask = await post({
  type: 2,
  token: "tok",
  data: { name: "ask", options: [{ name: "question", value: "trời mai có nắng không?" }] },
});
check("/ask defers", ask.json, { type: 5 });
checkThat("/ask schedules background work", typeof ask.background === "function");

const askEmpty = await post({
  type: 2,
  token: "tok",
  data: { name: "ask", options: [{ name: "question", value: "   " }] },
});
check("/ask with a blank question replies immediately", (askEmpty.json as { type: number }).type, 4);
checkThat("/ask with a blank question schedules nothing", askEmpty.background === undefined);

const unknown = await post({ type: 2, token: "tok", data: { name: "nope" } });
check("unknown command replies immediately", (unknown.json as { type: number }).type, 4);
checkThat("unknown command schedules nothing", unknown.background === undefined);

const malformed = await handleInteraction("not json", signBody("not json"), "1700000000");
check("malformed body returns 400", malformed.status, 400);

report();
