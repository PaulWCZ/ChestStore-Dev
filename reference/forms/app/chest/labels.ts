// The number of an item in a list, as the brand writes it: 001, 002…
export const number = (i: number): string => String(i + 1).padStart(3, "0");

// when is a moment as the interface's language writes it, in the Chest's
// time zone.
export const when = (iso: string, dateLocale: string): string =>
  new Intl.DateTimeFormat(dateLocale, { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Paris" }).format(new Date(iso));
