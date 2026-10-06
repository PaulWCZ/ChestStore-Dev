// For islands: call() an action, refresh() the page in place, navigate()
// to another page in place, toast() a message, fill() and plural() words.
// The tool's src/entry.tsx starts the browser with start() from
// "@argentic/chest-app/browser".
export { call, navigate, onLinkClick, refresh, toast, ToastHost } from "./runtime.tsx";
export { fill, plural, type Plural } from "./i18n.ts";
