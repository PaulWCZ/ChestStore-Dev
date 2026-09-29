// Safe in the browser: no SDK here.
// What a service refuses, as a code: the pages put it in words
// (lib/i18n, errors.<code>). Services never return sentences.
export const errorCodes = ["forbidden", "not_found", "invalid", "invalid_email", "invalid_phone", "too_long", "empty", "too_many", "too_many_types", "too_many_moves", "too_fast", "too_late", "taken", "slug_taken", "invalid_link", "not_host", "too_many_questions", "choices_needed", "too_many_choices", "answer_missing", "answer_too_long", "invalid_site", "too_many_sites", "invalid_range", "calendar_not_allowed", "calendar_unreachable", "calendar_refused", "calendar_not_found", "calendar_not_calendar", "calendar_too_large", "too_many_calendars", "import_unreadable", "unavailable", "unknown"] as const;
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
