import { field, type Field } from "@argentic/chest-app";
import { limits } from "../shared/model.ts";

// An email address, which a client's card, the company's details and an
// imported row may leave empty: "" (or only spaces) is "", anything else
// is read by the package's rule (field.email: trimmed, the domain
// lower-cased, the part before the @ as written; display names, controls,
// quotes, IP literals refused with "invalid_email"). The actions read
// addresses with the same field; the importers hold a file's addresses to
// it. Kept out of shared/model.ts, which the islands load.
const address = field.email({ max: limits.email });

export function email(value: unknown): string {
  if (value === undefined || value === null || (typeof value === "string" && value.trim() === "")) return "";
  return address.read(value);
}

// The same, as an action's field: what the person sent, "" to clear it.
export const optionalEmail: Field<string> = { read: value => email(value) };
