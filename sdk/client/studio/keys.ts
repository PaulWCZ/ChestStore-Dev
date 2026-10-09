import { createHash } from "node:crypto";

// Studio proposal (not in 0.4.1; 0.3.0-studio.15): idempotency keys of any length.
// Not a published module: mail, events (publish) and webhooks use it, and
// mail re-exports idempotencyKey for tools that store the key the Chest saw.
//
// A key that makes a retry harmless (mail.send, events.publish,
// webhooks.send) is the tool's name for one thing sent: the Chest keeps 1 to
// 64 of A-Z a-z 0-9 . _ : -. Tools build theirs from parts — a digest, a
// day, a member id — and a cap of 64 made them cut the end off: past 33
// characters of their own, `${key}:${member}`.slice(0, 64) lost the
// recipient, two recipients shared a key and the Chest answered the second
// with the first message (one email dropped, silently). So the SDK takes
// any key of 1 to 512 characters without control characters and sends a
// key that fits: as given when it already does, otherwise "sha256:" and the
// SHA-256 of the whole key in base64url (50 characters) — never cut, so two
// different keys stay two keys. A key given as "sha256:…" is hashed too:
// nothing a tool writes can pose as the digest of another key.
const plainKey = /^[A-Za-z0-9._:-]{1,64}$/u;
export const maxKeyLength = 512;

// idempotencyKey is the key the Chest receives for a key a tool gives, or
// null when it is not a key (empty, beyond 512 characters, a control
// character, not a string).
export function idempotencyKey(key: unknown): string | null {
  if (typeof key !== "string" || key.length < 1 || key.length > maxKeyLength || /\p{Cc}/u.test(key)) return null;
  if (plainKey.test(key) && !key.startsWith("sha256:")) return key;
  return "sha256:" + createHash("sha256").update(key, "utf8").digest("base64url");
}
