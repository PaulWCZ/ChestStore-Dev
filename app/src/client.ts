// For islands: call() an action, refresh() the page in place, navigate()
// to another page in place, toast() a message, fill() and plural() words.
// The tool's src/entry.tsx starts the browser with start() from
// "@argentic/chest-app/browser".
export { call, navigate, onLinkClick, refresh, toast, ToastHost, useAutoRefresh } from "./runtime.tsx";
// send(url, headers, body, options): what call() and the enhanced forms do
// — for a form an island sends itself (a FormData to an action's URL).
export { send } from "./runtime.tsx";
export { fill, plural, type Plural } from "./i18n.ts";
// The honeypot and token of a public form an island renders.
export { FormToken, Honeypot } from "./form.tsx";
// For rules a tool shares between its server and its islands (an import
// read in the browser to show it, then again on the server): they refuse
// with the same codes on both sides.
export { AppError, fail, readEmail, readMoney, type EmailRead } from "./tool.ts";
// The types an island needs: an action's outcome (call()'s answer), what
// it sends, the codes and words, plain props.
export type { Outcome, SentOf } from "./tool.ts";
export type { ErrorCode, Words } from "./register.ts";
export type { Plain } from "./island.tsx";
