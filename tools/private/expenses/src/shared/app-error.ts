// Safe in the browser: no SDK here.
// What a service refuses, as a code: the pages put it in words
// (src/i18n, errors.<code>). Services never return sentences. The error
// itself is the package's (@argentic/chest-app: an action answers its code
// and the reader's sentence, a page its 403 or 404).
export { AppError } from "@argentic/chest-app/client";

export const errorCodes = [
  "forbidden", "not_found", "invalid", "too_long", "too_large", "empty", "too_many",
  "amount_invalid", "amount_ambiguous", "rate_invalid", "date_invalid", "date_future", "vat_too_high", "currency_invalid",
  "distance_invalid", "no_vehicle", "no_scale", "scale_invalid",
  "not_draft", "refused_unchanged", "not_submitted", "not_approved", "self_approval", "reason_needed", "nothing_selected",
  "approver_invalid", "category_invalid", "allowance_invalid", "count_invalid", "account_invalid", "iban_invalid", "iban_checksum", "bank_sealed", "bic_invalid", "no_company_bank", "no_bank_details", "sepa_currency", "nothing_to_pay", "file_gone", "address_needed",
  "statement_empty", "statement_touched",
  "file_missing", "file_too_large", "file_type", "receipt_locked",
  "export_too_large", "unavailable", "unknown",
] as const;
export type ErrorCode = (typeof errorCodes)[number];
