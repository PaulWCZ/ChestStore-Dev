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

// check refuses a token not signed here, older than a day, or (unless
// fast is allowed: a file added while the form is filled) too recent.
export function check(token: unknown, now = Date.now(), options: { fast?: boolean } = {}): void {
  const [value = "", signature = ""] = typeof token === "string" ? token.split(".") : [];
  const expected = sign(value);
  if (!/^\d{13}$/u.test(value) || signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new AppError("invalid");
  const age = now - Number(value);
  if (age < formLimits.minimumSeconds * 1000 && !options.fast) throw new AppError("too_fast");
  if (age > 86400000) throw new AppError("invalid");
}
