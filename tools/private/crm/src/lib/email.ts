import { field } from "@argentic/chest-app";
import { limits } from "../shared/model.ts";

// email: an address as a person or a file gives it, by the package's rule
// (field.email: trimmed, the domain lower-cased, the part before "@" kept
// as written; refused with "invalid_email" — a display name, a space, two
// "@", a domain without a dot…). Nothing ("", only spaces) is no address:
// a contact may have none. One rule for every way in: the forms, a CSV or
// vCard import, a form's or a booking's respondent. Compare addresses by
// emailKey (shared/model.ts), never as written.
const address = field.email({ max: limits.email });
export function email(value: unknown): string {
  if (value === undefined || value === null || (typeof value === "string" && value.trim() === "")) return "";
  return address.read(value);
}
