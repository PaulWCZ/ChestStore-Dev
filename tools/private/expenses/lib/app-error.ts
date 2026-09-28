// Safe in the browser: no SDK here.
// What a service refuses, as a code: the pages put it in words
// (lib/i18n, errors.<code>). Services never return sentences.
export const errorCodes = [
  "forbidden", "not_found", "invalid", "too_long", "empty", "too_many",
  "amount_invalid", "date_invalid", "date_future", "vat_too_high", "currency_invalid",
  "distance_invalid", "no_vehicle", "no_scale", "scale_invalid",
  "not_draft", "not_submitted", "not_approved", "self_approval", "reason_needed", "nothing_selected",
  "approver_invalid", "category_invalid",
  "file_missing", "file_too_large", "file_type", "receipt_locked",
  "export_too_large", "unavailable", "unknown",
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
