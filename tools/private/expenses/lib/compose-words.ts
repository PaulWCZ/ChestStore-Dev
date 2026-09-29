import type { Catalogue } from "./i18n/index.ts";

// The words the add and edit screens need (a part of the catalogue: the
// browser gets no more than it shows).
export function composeWords(t: Catalogue) {
  return { form: t.form, receipt: t.receipt, trip: t.trip, allowance: t.allowance, errors: t.errors, date: t.date, saved: t.home.saved, send: t.home.send.one, sent: t.home.sent, sentAlone: t.home.sentAlone };
}
