import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { AppError } from "./app-error.ts";

// Sealing what must not be read from a copy of the database (bank account
// numbers). With the Chest variable BANK_DETAILS_KEY — a secret the Chest
// keeps sealed at rest, never shown back: 32 random bytes in base64 —
// values are sealed with AES-256-GCM, bound to what they belong to (a
// sealed value moved to another row does not open). Without it they are
// kept as typed, in the tool's own database, which no other tool reaches.
// A primitive of the Chest would do better (a key the tool never holds):
// see README, "Needs from the SDK".

const variable = "BANK_DETAILS_KEY";

function key(): Buffer | null {
  const raw = process.env[variable];
  if (!raw) return null;
  const bytes = Buffer.from(raw, "base64");
  if (bytes.length !== 32) throw new Error(`${variable} must be 32 bytes in base64`);
  return bytes;
}

export function sealing(): boolean {
  return key() !== null;
}

export function seal(plain: string, context: string): string {
  const k = key();
  if (!k) return "v0." + plain;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", k, iv);
  cipher.setAAD(Buffer.from(context));
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return "v1." + Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64");
}

// unseal gives the value back; a value sealed under a key the tool no
// longer has (or moved to another row) is "bank_sealed", never a guess.
export function unseal(sealed: string, context: string): string {
  if (sealed.startsWith("v0.")) return sealed.slice(3);
  const k = key();
  if (!sealed.startsWith("v1.") || !k) throw new AppError("bank_sealed");
  const bytes = Buffer.from(sealed.slice(3), "base64");
  try {
    const decipher = createDecipheriv("aes-256-gcm", k, bytes.subarray(0, 12));
    decipher.setAAD(Buffer.from(context));
    decipher.setAuthTag(bytes.subarray(12, 28));
    return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString("utf8");
  } catch {
    throw new AppError("bank_sealed");
  }
}
