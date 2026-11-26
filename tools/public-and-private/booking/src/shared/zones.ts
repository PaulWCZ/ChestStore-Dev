import { offset } from "./zone.ts";

// The time zone picker's list, as people read it: a city and its distance
// from UTC now ("Paris (UTC+2)"), the zones most people here need first,
// then every region in its own group, sorted by city. Old names the
// runtime still lists (Asmera, Calcutta, Kiev, Saigon…) are written as
// today's. Written on the server (the browser's list and words may differ:
// hydration) and pure.

export type ZoneOption = { value: string; label: string };
export type ZoneGroup = { region: string; zones: ZoneOption[] };

// Today's names of the old ones Intl.supportedValuesOf still gives.
const renamed: Record<string, string> = {
  "Africa/Asmera": "Africa/Asmara",
  "America/Buenos_Aires": "America/Argentina/Buenos_Aires",
  "America/Catamarca": "America/Argentina/Catamarca",
  "America/Cordoba": "America/Argentina/Cordoba",
  "America/Jujuy": "America/Argentina/Jujuy",
  "America/Mendoza": "America/Argentina/Mendoza",
  "America/Godthab": "America/Nuuk",
  "America/Indianapolis": "America/Indiana/Indianapolis",
  "America/Louisville": "America/Kentucky/Louisville",
  "Asia/Calcutta": "Asia/Kolkata",
  "Asia/Katmandu": "Asia/Kathmandu",
  "Asia/Rangoon": "Asia/Yangon",
  "Asia/Saigon": "Asia/Ho_Chi_Minh",
  "Atlantic/Faeroe": "Atlantic/Faroe",
  "Europe/Kiev": "Europe/Kyiv",
  "Pacific/Enderbury": "Pacific/Kanton",
  "Pacific/Ponape": "Pacific/Pohnpei",
  "Pacific/Truk": "Pacific/Chuuk",
};
export const modernZone = (zone: string) => renamed[zone] ?? zone;

// The zones offered first: the Chest's customers' and their partners' —
// France's overseas departments and territories among them.
export const commonZones = ["Europe/Paris", "Europe/London", "Europe/Brussels", "Europe/Berlin", "Europe/Madrid", "Europe/Rome", "Europe/Zurich", "Europe/Lisbon", "America/New_York", "America/Toronto", "America/Chicago", "America/Los_Angeles", "America/Sao_Paulo", "Africa/Casablanca", "Africa/Dakar", "Asia/Dubai", "Asia/Kolkata", "Asia/Singapore", "Asia/Tokyo", "Australia/Sydney", "America/Martinique", "America/Guadeloupe", "America/Cayenne", "Indian/Reunion", "Indian/Mayotte", "Pacific/Noumea", "Pacific/Tahiti"];

export const regions = ["Europe", "America", "Africa", "Asia", "Australia", "Pacific", "Atlantic", "Indian", "Antarctica", "Arctic"] as const;
export type Region = (typeof regions)[number];

// The city of a zone in the reader's language: the catalogue's name when
// it has one ("Europe/Brussels" → "Bruxelles"; "America/Toronto" →
// "Toronto, Montréal", the city people there look for), otherwise the
// zone's own ("America/Argentina/Buenos_Aires" → "Buenos Aires").
export type Cities = Readonly<Record<string, string>>;
export const cityOf = (zone: string, cities: Cities = {}) => cities[modernZone(zone)] ?? (modernZone(zone).split("/").at(-1) ?? zone).replace(/_/gu, " ");

export function utcOffset(zone: string, now: number): string {
  const minutes = offset(now, zone);
  if (minutes === 0) return "UTC";
  const sign = minutes > 0 ? "+" : "−";
  const abs = Math.abs(minutes);
  return `UTC${sign}${Math.floor(abs / 60)}${abs % 60 ? ":" + String(abs % 60).padStart(2, "0") : ""}`;
}

export function zoneLabel(zone: string, now: number, cities: Cities = {}): string {
  return `${cityOf(zone, cities)} (${utcOffset(zone, now)})`;
}

// zoneGroups: "Common" first, then each region. names: the words of the
// groups and the cities in the reader's language; extra: zones to offer
// whatever the list (the one saved, the visitor's).
export function zoneGroups(names: { common: string; cities?: Cities } & Record<Region, string>, now: number, extra: string[] = [], all: string[] = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : []): ZoneGroup[] {
  const known = new Set<string>();
  for (const z of [...all, ...extra]) {
    const m = modernZone(z);
    if (m.includes("/") && regions.includes(m.split("/")[0] as Region)) known.add(m);
  }
  const option = (z: string): ZoneOption => ({ value: z, label: zoneLabel(z, now, names.cities) });
  const byCity = (a: ZoneOption, b: ZoneOption) => a.label.localeCompare(b.label, "en");
  const groups: ZoneGroup[] = [{ region: names.common, zones: commonZones.filter(z => known.has(z)).map(option) }];
  for (const region of regions) {
    const zones = [...known].filter(z => z.startsWith(region + "/")).map(option).sort(byCity);
    if (zones.length > 0) groups.push({ region: names[region], zones });
  }
  return groups;
}
