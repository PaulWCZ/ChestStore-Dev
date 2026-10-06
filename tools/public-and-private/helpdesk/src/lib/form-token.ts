import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { AppError } from "./app-error.ts";
import { formLimits } from "./tickets.ts";

// The public form carries the time it was shown, signed by the tool: a form
// sent faster than a person can type (or never shown) is refused, without
// a captcha. The key is derived from the Chest's token (a secret the tool
// holds); outside a Chest, a key of this process.
const fallback = randomBytes(32);
const key = () => (process.env["CHEST_TOKEN"] ? createHmac("sha256", process.env["CHEST_TOKEN"]).update("support form v1").digest() : fallback);
const sign = (value: string) => createHmac("sha256", key()).update(value).digest("base64url");

export function issue(now = Date.now()): string {
  const value = String(now);
  return `${value}.${sign(value)}`;
}

// check refuses a token not signed here, or older than a day. A form sent
// faster than a person can possibly write (under a second and a half) is
// refused; one sent a little faster than the minimum (a person who
// pasted, or who corrected one field after an error — the page keeps the
// first token) is not refused: check says how long to wait, and the
// action waits that long in silence before taking it. Unless fast is
// allowed (a file added while the form is filled). Says the milliseconds
// to wait.
export function check(token: unknown, now = Date.now(), options: { fast?: boolean } = {}): number {
  const [value = "", signature = ""] = typeof token === "string" ? token.split(".") : [];
  const expected = sign(value);
  if (!/^\d{13}$/u.test(value) || signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new AppError("invalid");
  const age = now - Number(value);
  if (age > 86400000) throw new AppError("invalid");
  if (options.fast) return 0;
  if (age < formLimits.refuseSeconds * 1000) throw new AppError("too_fast");
  return Math.max(0, formLimits.minimumSeconds * 1000 - age);
}
