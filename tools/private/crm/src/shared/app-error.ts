// Safe in the browser: no SDK here.
// What a rule refuses, as a code (@argentic/chest-app's AppError): the
// package puts it in the reader's words (src/i18n, errors.<code>) for an
// action, and makes a 403/404 page of it in a page. Rules never return
// sentences.
export { AppError, fail, type ErrorCode } from "@argentic/chest-app/client";
