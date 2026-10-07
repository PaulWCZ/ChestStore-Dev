import { field } from "@argentic/chest-app";
import { limits } from "../shared/model.ts";

// email: a work address as HR writes it, by the package's rule
// (field.email: trimmed, the domain lower-cased, the part before "@" kept
// as written; refused with "invalid_email" — a display name, a space, two
// "@", a domain without a dot…). Nothing ("", only spaces) is no address:
// an arrival may have none yet. Server only (the package's fields do not
// run in the browser). Compare addresses lower-cased, never as written:
// the Chest's members.matchEmails does.
const address = field.email({ max: limits.email });
export function email(value: unknown): string {
  if (value === undefined || value === null || (typeof value === "string" && value.trim() === "")) return "";
  return address.read(value);
}
