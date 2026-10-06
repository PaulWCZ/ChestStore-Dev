// What a service refuses, as a code: @argentic/chest-app's AppError (its
// fail()), so an action answers the code and the reader's sentence
// (i18n, errors.<code>) and a page answers 404 or 403 — never a 500.
// Services never return sentences. Safe in the browser: the rules shared
// with islands (shared/model.ts) refuse with the same codes.
export { AppError } from "@argentic/chest-app/client";

// The tool's own codes, besides the package's (invalid, empty, too_long,
// too_large, forbidden, not_found, unavailable, unknown): each is a
// sentence in every catalogue (test/i18n.test.ts).
export const errorCodes = ["forbidden", "not_found", "invalid", "too_long", "empty", "too_many", "cycle", "not_member", "import_invalid", "dates", "started", "too_large", "file_too_large", "type_refused", "unavailable", "number_taken", "already_asked", "unknown"] as const;
export type ErrorCode = (typeof errorCodes)[number];
