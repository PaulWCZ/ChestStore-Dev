// Proposal (studio): the Chest's own settings, which every tool needs and
// none should ask its admin for again — the company's name, its time zone,
// its currency and language, and the addresses the tool is served at. The
// Chest gives them to each tool in its environment (read at call time: a
// change by the owner reaches the tool at its next start):
//
//   CHEST_COMPANY     the company's name, as the owner wrote it ("Atelier Martin")
//   CHEST_TIMEZONE    an IANA zone ("Europe/Paris")
//   CHEST_CURRENCY    an ISO 4217 code ("EUR")
//   CHEST_LOCALE      the Chest's default language ("fr")
//   CHEST_TEAM_URL    the tool's team host ("https://tasks-chest.atelier-martin.fr")
//   CHEST_PUBLIC_URL  its public host, for a tool with a public part
//                     ("https://booking.atelier-martin.fr"); absent otherwise
//
// Before: every tool hard-coded Europe/Paris, derived its public address
// from X-Forwarded-Host (and remembered it in its database for emails sent
// by a schedule), and asked its admin for the company's name in its own
// settings.
import { ask, json } from "./api.js";
import { localeOf, type Locale } from "./member.js";

const env = (name: string): string | undefined => {
  const value = process.env[name];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
};

// company is the company's name ("" when the Chest has none).
export function company(): string {
  const value = env("CHEST_COMPANY");
  return value && value.length <= 120 && !/[\u0000-\u001f]/u.test(value) ? value : "";
}

// timeZone is the Chest's time zone: the day of "due today", the hour of a
// reminder. Europe/Paris when the Chest says none, or one this runtime does
// not know.
export function timeZone(): string {
  const value = env("CHEST_TIMEZONE");
  if (value && value.length <= 64) {
    try {
      new Intl.DateTimeFormat("en", { timeZone: value });
      return value;
    } catch {
      // Not a zone this runtime knows: the default.
    }
  }
  return "Europe/Paris";
}

// today is the date ("YYYY-MM-DD") at that instant in the Chest's zone (or
// the one given).
export function today(at: Date | number = Date.now(), zone: string = timeZone()): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(typeof at === "number" ? new Date(at) : at).map(p => [p.type, p.value]));
  return `${parts["year"]}-${parts["month"]}-${parts["day"]}`;
}

// currency is the company's currency (ISO 4217), EUR by default.
export function currency(): string {
  const value = env("CHEST_CURRENCY");
  return value && /^[A-Z]{3}$/u.test(value) ? value : "EUR";
}

// locale is the Chest's default language: the language of what a tool
// writes for no one in particular (a public page before the visitor
// chooses, an export's default).
export function locale(): Locale {
  return localeOf(env("CHEST_LOCALE"));
}

const origin = (value: string | undefined): string | null => {
  if (!value) return null;
  try {
    const url = new URL(value);
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) return null;
    return url.origin;
  } catch {
    return null;
  }
};

// teamUrl is the origin of the tool's team host (links in an export, in a
// notification's email, in a calendar feed); null outside a Chest.
export function teamUrl(): string | null {
  return origin(env("CHEST_TEAM_URL"));
}

// publicUrl is the origin of the tool's public host (a customer's link in
// an email sent by a schedule, a feed's address); null for a tool without
// a public part, or outside a Chest.
export function publicUrl(): string | null {
  return origin(env("CHEST_PUBLIC_URL"));
}

// Proposal (studio): the look the company chose for its tools. The owner
// chooses once in the Chest's admin — for all tools, and, if they want,
// otherwise for one tool — among three answers:
//
//   own        each tool keeps its own identity (the default)
//   catalogue  one theme of the catalogue (@argentic/chest-ui), by id
//   brand      the company's brand: its colours, fonts, corners, density
//              and logo, from which the kit derives a theme
//
// The Chest resolves the two levels itself: a tool receives only its own
// answer, and scope says where it came from ("tool" when this tool has an
// override, "chest" for the company's choice for all, "default" when the
// Chest says nothing). Files — the catalogue's fonts, the brand's fonts and
// logo — are served by the Chest's front on the tool's own hosts, under
// /_chest/theme/: the tool's Content-Security-Policy ('self') admits them.
//
//   const choice = await chest.theme();
//   // { mode: "catalogue", theme: "library", fonts: "/_chest/theme/fonts", faces: [], scope: "chest" }
//
// theme() never throws: the look must never break a page. Outside a Chest,
// on a Chest without themes (404), when it cannot be reached, or when its
// answer is not what this module expects, the answer is { mode: "own",
// scope: "default" }. The answer is kept for as long as the Chest says
// (Cache-Control max-age, 5 minutes at most; 60 seconds when it says
// nothing), so a page asks at most once a minute.

export type ThemeFontFile = { url: string; weight: string; style: "normal" | "italic" };
// A font of the brand: one of the catalogue's (id), or the company's own
// files (a family and its files on /_chest/theme/).
export type ThemeFont = { id: string } | { family: string; files: ThemeFontFile[] };
export type BrandChoice = {
  name: string;
  primary: string;
  secondary: string | null;
  neutral: string | null;
  corners: "sharp" | "soft" | "round";
  density: "comfortable" | "compact";
  display: ThemeFont | null;
  body: ThemeFont | null;
  logo: { url: string; alt: string } | null;
};
export type ThemeScope = "chest" | "tool" | "default";
export type ThemeChoice =
  | { mode: "own"; scope: ThemeScope }
  // fonts: where the catalogue's font files are served; faces: fonts the
  // Chest holds a licence for and serves itself (a family a theme names
  // without files, such as the portal's).
  | { mode: "catalogue"; theme: string; fonts: string; faces: ({ family: string } & ThemeFontFile)[]; scope: ThemeScope }
  | { mode: "brand"; brand: BrandChoice; fonts: string; scope: ThemeScope };

export const themeIdPattern = /^[a-z][a-z0-9-]{1,39}$/u;
const colourPattern = /^#[0-9a-f]{6}$/u;
const familyPattern = /^[\p{L}\p{N}][\p{L}\p{N} ._-]{0,63}$/u;
// A file of the look: a path under /_chest/theme/ on the tool's own origin.
const themePath = (value: unknown, extensions: string): value is string => typeof value === "string" && value.length <= 240 && !value.includes("..") && !value.includes("//") && new RegExp(`^/_chest/theme/[A-Za-z0-9._~\\-/]+\\.(${extensions})$`, "u").test(value);
const fontsBase = (value: unknown): value is string => typeof value === "string" && value.length <= 120 && !value.includes("..") && /^\/_chest\/theme(\/[A-Za-z0-9._~-]+)*$/u.test(value);
const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const fontFile = (value: unknown): ThemeFontFile | null => {
  if (!record(value) || !themePath(value["url"], "woff2|woff|ttf|otf")) return null;
  const weight = typeof value["weight"] === "string" && /^[1-9]00( [1-9]00)?$/u.test(value["weight"]) ? value["weight"] : "400";
  return { url: value["url"], weight, style: value["style"] === "italic" ? "italic" : "normal" };
};
const themeFont = (value: unknown): ThemeFont | null | undefined => {
  if (value === null || value === undefined) return null;
  if (!record(value)) return undefined;
  if (typeof value["id"] === "string") return themeIdPattern.test(value["id"]) ? { id: value["id"] } : undefined;
  if (typeof value["family"] !== "string" || !familyPattern.test(value["family"]) || !Array.isArray(value["files"]) || value["files"].length === 0 || value["files"].length > 8) return undefined;
  const files = value["files"].map(fontFile);
  return files.every((f): f is ThemeFontFile => f !== null) ? { family: value["family"], files } : undefined;
};
const optionalColour = (value: unknown): string | null | undefined => (value === null || value === undefined ? null : typeof value === "string" && colourPattern.test(value) ? value : undefined);

const defaultTheme: ThemeChoice = { mode: "own", scope: "default" };

// readThemeChoice checks an answer of the Chest word by word; null when it
// is not a choice this module knows (the caller then keeps the tool's own
// identity). Exported for the Chest's own tests and the fake Chest.
export function readThemeChoice(value: unknown): ThemeChoice | null {
  if (!record(value)) return null;
  const scope = value["scope"] === "chest" || value["scope"] === "tool" ? value["scope"] : "default";
  if (value["mode"] === "own") return { mode: "own", scope };
  if (value["mode"] === "catalogue") {
    if (typeof value["theme"] !== "string" || !themeIdPattern.test(value["theme"])) return null;
    const fonts = value["fonts"] === undefined ? "/_chest/theme/fonts" : value["fonts"];
    if (!fontsBase(fonts)) return null;
    const given = value["faces"] === undefined ? [] : value["faces"];
    if (!Array.isArray(given) || given.length > 16) return null;
    const faces: ({ family: string } & ThemeFontFile)[] = [];
    for (const face of given) {
      const file = fontFile(face);
      if (!file || !record(face) || typeof face["family"] !== "string" || !familyPattern.test(face["family"])) return null;
      faces.push({ family: face["family"], ...file });
    }
    return { mode: "catalogue", theme: value["theme"], fonts, faces, scope };
  }
  if (value["mode"] === "brand") {
    const b = value["brand"];
    if (!record(b) || typeof b["primary"] !== "string" || !colourPattern.test(b["primary"])) return null;
    const secondary = optionalColour(b["secondary"]), neutral = optionalColour(b["neutral"]);
    const display = themeFont(b["display"]), body = themeFont(b["body"]);
    if (secondary === undefined || neutral === undefined || display === undefined || body === undefined) return null;
    const name = typeof b["name"] === "string" ? b["name"].replace(/\p{Cc}/gu, "").trim().slice(0, 80) : "";
    const corners = b["corners"] === "sharp" || b["corners"] === "round" ? b["corners"] : "soft";
    const density = b["density"] === "compact" ? "compact" : "comfortable";
    let logo: BrandChoice["logo"] = null;
    if (b["logo"] !== null && b["logo"] !== undefined) {
      const l = b["logo"];
      if (!record(l) || !themePath(l["url"], "svg|png|webp|jpg|jpeg")) return null;
      logo = { url: l["url"], alt: typeof l["alt"] === "string" ? l["alt"].replace(/\p{Cc}/gu, "").trim().slice(0, 120) : name };
    }
    const fonts = value["fonts"] === undefined ? "/_chest/theme/fonts" : value["fonts"];
    if (!fontsBase(fonts)) return null;
    return { mode: "brand", brand: { name, primary: b["primary"], secondary, neutral, corners, density, display, body, logo }, fonts, scope };
  }
  return null;
}

let kept: { api: string; value: ThemeChoice; until: number } | null = null;
let pending: { api: string; answer: Promise<ThemeChoice> } | null = null;

// theme is the look the company chose for this tool (see above).
export async function theme(): Promise<ThemeChoice> {
  const api = process.env["CHEST_API"] ?? "";
  if (!api) return defaultTheme;
  if (kept && kept.api === api && kept.until > Date.now()) return kept.value;
  if (pending && pending.api === api) return pending.answer;
  const answer = (async (): Promise<ThemeChoice> => {
    let value: ThemeChoice = defaultTheme, seconds = 60;
    try {
      const response = await ask("theme", "GET", "/theme");
      const age = /max-age=(\d{1,6})/u.exec(response.headers.get("cache-control") ?? "");
      if (age) seconds = Math.min(300, Number(age[1]));
      if (response.status === 200) value = readThemeChoice(await json(response)) ?? defaultTheme;
      else await response.body?.cancel();
    } catch {
      // Not in a Chest, or the Chest cannot be reached: the tool's own look.
      seconds = 10;
    }
    kept = { api, value, until: Date.now() + seconds * 1000 };
    return value;
  })();
  pending = { api, answer };
  try {
    return await answer;
  } finally {
    if (pending?.answer === answer) pending = null;
  }
}

// forgetTheme drops the answer kept, so the next theme() asks the Chest
// (a test that changes the fake Chest's choice; the Chest's own admin
// preview).
export function forgetTheme(): void {
  kept = null;
  pending = null;
}
