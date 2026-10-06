// What a rule refuses, as a code: the reader sees errors.<code> of their
// catalogue (src/i18n). Rules never return sentences. AppError is the
// package's, so an action refused here reaches an island (a toast) or a
// form (?error=) in the reader's words. The list is every code the rules
// use (a page checks a code from the address against it).
export { AppError, fail } from "@argentic/chest-app";
export const errorCodes = ["forbidden", "not_found", "invalid", "invalid_email", "invalid_url", "invalid_time", "empty", "too_long", "too_large", "too_many", "too_fast", "no_components", "in_use", "has_children", "already_resolved", "not_resolved", "required", "invalid_file", "last_update", "not_future", "ended", "unavailable", "no_mail", "no_hooks", "hooks_paused", "hook_slack", "hook_teams", "hook_address", "hook_no_answer", "unknown"] as const;
export type ErrorCode = (typeof errorCodes)[number];
