// Safe in the browser: no SDK here.
// What a service refuses, as a code: the pages put it in words
// (lib/i18n, errors.<code>). Services never return sentences.
export const errorCodes = ["forbidden", "not_found", "invalid", "invalid_email", "too_long", "empty", "too_many", "too_fast", "closed_form", "file_type", "file_too_large", "too_many_files", "file_missing", "files_unavailable", "invalid_rule", "rule_empty", "invalid_origin", "invalid_url", "merged", "merge_same", "merge_other_customer", "not_closed", "unavailable", "unknown"] as const;
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
