import { createDecipheriv } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { isSealed, openMany, seal } from "@argentic/chest-sdk/sealed";
import { MemberRequired, NotAllowed, SealedInvalid, SealedLocked, SealedLost } from "@argentic/chest-sdk/errors";
import { AppError } from "../shared/app-error.ts";

// Bank account numbers are sealed by the Chest (the SDK's `sealed`): the
// key never leaves the Chest, the database and its backups hold
// `chest:sealed:1:…` (shown as "Sealed" in the Data tab), and a value opens
// only on the request of a member who holds the role `accountant` — the
// Chest checks the role at every open, and journals each one. Each value is
// bound to its owner ("bank:<member>", "bank:company"): copied into another
// row, it opens nowhere.
//
// Who reaches what stays the tool's rule too (src/lib/bank.ts): a person
// sees their own account masked (its last four characters are kept in
// clear for that) and replaces or removes it; only the accountants'
// transfer file ever holds a whole IBAN, opened at the click that
// downloads it. Nothing opened is logged, mailed or given to an AI.
const roles = ["accountant"];

export const bankContext = (owner: string): string => "bank:" + owner;

export function sealIban(plain: string, owner: string): Promise<string> {
  return seal(plain, { context: bankContext(owner), roles });
}

// openIbans opens the account numbers a transfer file needs, on the
// request of the accountant who downloads it, in one call. A value this
// member may not open, altered, or of another row is "bank_sealed"; the
// Chest's sealed data waiting for its owner's recovery code is
// "bank_locked".
export async function openIbans(request: IncomingMessage | Request, items: { sealed: string; owner: string }[]): Promise<string[]> {
  const out = items.map(item => (isSealed(item.sealed) ? "" : openLegacy(item.sealed, item.owner)));
  const chest = items.flatMap((item, i) => (isSealed(item.sealed) ? [{ item, i }] : []));
  if (chest.length === 0) return out;
  let opened: (string | null)[];
  try {
    opened = await openMany(request, chest.map(x => ({ sealed: x.item.sealed, context: bankContext(x.item.owner) })));
  } catch (error) {
    if (error instanceof SealedLocked) throw new AppError("bank_locked");
    if (error instanceof NotAllowed || error instanceof SealedInvalid || error instanceof SealedLost || error instanceof MemberRequired) throw new AppError("bank_sealed");
    throw error;
  }
  chest.forEach((x, k) => {
    const value = opened[k];
    if (typeof value !== "string") throw new AppError("bank_sealed");
    out[x.i] = value;
  });
  return out;
}

// ---- Values written before the Chest sealed them (Expenses 0.2 and
// earlier): "v0.<IBAN>" when the tool had no key, "v1.<AES-256-GCM>" under
// the variable BANK_DETAILS_KEY. The nightly cleanup seals them again with
// the Chest (resealLegacy in src/lib/bank.ts; sealing needs no member), so
// after one night none is left; until then a transfer file still opens
// them here. BANK_DETAILS_KEY stays in chest.json's "env" for that move
// only, and goes in the next version.

const variable = "BANK_DETAILS_KEY";

export const isLegacy = (value: string): boolean => value.startsWith("v0.") || value.startsWith("v1.");

function legacyKey(): Buffer | null {
  const raw = process.env[variable];
  if (!raw) return null;
  const bytes = Buffer.from(raw, "base64");
  return bytes.length === 32 ? bytes : null;
}

// openLegacy gives back a value of the old formats; one under a key the
// tool no longer has (or moved to another row) is "bank_sealed", never a
// guess.
export function openLegacy(value: string, owner: string): string {
  if (value.startsWith("v0.")) return value.slice(3);
  const k = legacyKey();
  if (!value.startsWith("v1.") || !k) throw new AppError("bank_sealed");
  const bytes = Buffer.from(value.slice(3), "base64");
  try {
    const decipher = createDecipheriv("aes-256-gcm", k, bytes.subarray(0, 12));
    decipher.setAAD(Buffer.from(bankContext(owner)));
    decipher.setAuthTag(bytes.subarray(12, 28));
    return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString("utf8");
  } catch {
    throw new AppError("bank_sealed");
  }
}
