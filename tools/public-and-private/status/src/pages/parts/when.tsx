import { stamp } from "../../i18n/format.ts";

// A moment on a public page: written in the Chest's zone, rewritten in the
// visitor's by LocalTimes once the page is in their browser.
export function When({ at, zone, locale, now }: { at: Date; zone: string; locale: string; now?: Date }) {
  return <time dateTime={at.toISOString()} data-local="">{stamp(at, zone, locale, now)}</time>;
}
