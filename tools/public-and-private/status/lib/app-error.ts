// Safe in the browser: no SDK here.
// What a service refuses, as a code: the pages put it in words
// (lib/i18n, errors.<code>). Services never return sentences.
export const errorCodes = ["forbidden", "not_found", "invalid", "invalid_email", "invalid_url", "invalid_time", "empty", "too_long", "too_many", "too_fast", "no_components", "in_use", "has_children", "already_resolved", "not_resolved", "required", "invalid_file", "last_update", "not_future", "ended", "unavailable", "no_mail", "no_hooks", "hook_slack", "hook_teams", "hook_address", "hook_no_answer", "unknown"] as const;
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
