// Safe in the browser: no SDK here.
// What a service refuses, as a code: the pages put it in words
// (lib/i18n, errors.<code>). Services never return sentences.
export const errorCodes = [
  "forbidden",
  "not_found",
  "invalid",
  "too_long",
  "empty",
  "unavailable",
  "unknown",
  // A draft saved by someone else since this page loaded.
  "conflict",
  // A form that cannot be published as it is (lib/model.ts problems()).
  "incomplete",
  // Answering: the form stopped taking answers, reached its limit, was
  // already answered by this member, or was sent too fast or too often.
  "closed",
  "full",
  "already",
  "too_fast",
  "too_many",
  // Answers that do not fit the form (the details are per question).
  "answers",
  // Files.
  "file_invalid",
  "file_too_large",
  "file_missing",
  "files_off",
  // Settings.
  "anonymous_locked",
  "anonymous_files",
  // A contact needs an email or a phone question; a public form's ticket
  // needs the email question (lib/routes.ts).
  "route_contact",
  "route_request",
  "invalid_url",
  "too_few",
  "limit",
  // An anonymous form's answers are never listed one by one.
  "anonymous_rows",
  // Pictures (a cover, a picture choice): not an image the tool takes, or too large.
  "image_invalid",
  "image_too_large",
  // Websites allowed to show the public forms: not an https address.
  "invalid_site",
  // Importing: a file the tool cannot read.
  "import_invalid",
  // Web addresses (lib/hooks.ts): not of the kind's shape, did not answer
  // the Chest's check, or a Chest that cannot send to them yet.
  "webhook_slack",
  "webhook_teams",
  "webhook_address",
  "webhook_no_answer",
  "webhooks_unavailable",
] as const;
export type ErrorCode = (typeof errorCodes)[number];

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly values: Record<string, number | string>;
  constructor(code: ErrorCode, values: Record<string, number | string> = {}) {
    super(code);
    this.name = "AppError";
    this.code = code;
    this.values = values;
  }
}
