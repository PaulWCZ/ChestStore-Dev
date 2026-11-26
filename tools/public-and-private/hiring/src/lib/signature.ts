import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// The tool's own signature on what it hands a visitor and gets back: the
// name of the file it let them upload (lib/cv.ts). The key is derived from
// the Chest's token (a secret the tool holds); outside a Chest, a key of
// this process.
const fallback = randomBytes(32);
const key = (purpose: string) => (process.env["CHEST_TOKEN"] ? createHmac("sha256", process.env["CHEST_TOKEN"]).update("hiring " + purpose + " v1").digest() : createHmac("sha256", fallback).update(purpose).digest());
export const sign = (purpose: string, value: string) => createHmac("sha256", key(purpose)).update(value).digest("base64url");
export function verify(purpose: string, value: string, signature: string): boolean {
  const expected = sign(purpose, value);
  return signature.length === expected.length && timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
