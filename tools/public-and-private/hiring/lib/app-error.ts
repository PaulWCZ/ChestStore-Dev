// Safe in the browser: no SDK here.
// What a service refuses, as a code: the pages put it in words
// (lib/i18n, errors.<code>). Services never return sentences.
export const errorCodes = [
  "forbidden",
  "not_found",
  "invalid",
  "invalid_email",
  "invalid_link",
  "too_long",
  "empty",
  "too_many",
  "too_fast",
  "closed",
  "consent",
  "cv_missing",
  "cv_invalid",
  "cv_too_large",
  "slug_taken",
  "stage_not_empty",
  "has_candidates",
  "last_stage",
  "salary_order",
  "answer_missing",
  "import_invalid",
  "no_mailbox",
  "already_there",
  "too_large_image",
  "unavailable",
  "unknown",
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
