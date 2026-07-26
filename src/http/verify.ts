import { createPublicKey, verify } from "node:crypto";

/**
 * DER prefix for an Ed25519 SubjectPublicKeyInfo. Discord hands out the bare
 * 32-byte public key, but node:crypto wants a structured key, so the header is
 * prepended to turn it into a parseable SPKI blob.
 */
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

/**
 * Verifies that a request really came from Discord.
 *
 * Discord signs `timestamp + rawBody` with the application's private key, and
 * rejects an interactions endpoint that fails to reject bad signatures — it
 * sends deliberately invalid probes during registration. The raw body matters:
 * re-serialising parsed JSON does not reliably reproduce the signed bytes.
 */
export function verifyDiscordRequest(
  publicKeyHex: string,
  signatureHex: string | undefined,
  timestamp: string | undefined,
  rawBody: string,
): boolean {
  if (!signatureHex || !timestamp) return false;

  let signature: Buffer;
  let publicKey: Buffer;
  try {
    signature = Buffer.from(signatureHex, "hex");
    publicKey = Buffer.from(publicKeyHex, "hex");
  } catch {
    return false;
  }

  // Reject malformed input before handing it to the crypto layer.
  if (signature.length !== 64 || publicKey.length !== 32) return false;

  try {
    const key = createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, publicKey]),
      format: "der",
      type: "spki",
    });
    return verify(null, Buffer.from(timestamp + rawBody, "utf8"), key, signature);
  } catch {
    return false;
  }
}
