// Safe in the browser: no SDK here.
// What a service refuses, as a code: the pages put it in words
// (lib/i18n, errors.<code>). Services never return sentences.
export const errorCodes = [
  "forbidden", "not_found", "invalid", "too_long", "empty", "too_many",
  "amount_invalid", "quantity_invalid", "discount_invalid", "rate_invalid", "date_invalid", "percent_invalid",
  "siren_invalid", "siret_invalid", "vat_number_invalid", "iban_invalid", "bic_invalid", "email_invalid",
  "prefix_invalid", "capital_invalid", "penalty_invalid", "terms_invalid", "country_invalid",
  "not_draft", "not_final", "wrong_status", "no_client", "no_lines", "line_empty", "negative_total", "total_too_large",
  "company_incomplete", "client_incomplete", "client_archived", "no_email",
  "deposit_invalid", "nothing_left", "credit_too_large", "payment_too_large", "payment_invalid", "nothing_due",
  "frozen", "suppressed", "mail_quota", "logo_type", "logo_too_large", "terms_type", "terms_too_large", "bank_line_used", "registry_unreachable", "registry_not_found", "file_missing", "period_invalid", "export_too_large",
  "next_number_invalid", "next_number_backwards", "numbering_started", "link_invalid", "reminder_days_invalid", "account_invalid",
  "import_invalid", "import_empty", "import_too_large", "repeat_invalid",
  "name_short", "must_agree", "changed", "link_off", "expired", "answered", "too_fast", "too_many_tries", "no_pdf", "import_number_invalid", "import_used",
  "unavailable", "unknown",
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
