import { ask, json } from "../src/api.js";
import { chest as official, type Chest } from "../src/chest.js";
import { timeZonePattern } from "../src/member.js";

// @argentic/chest-sdk/chest as the studio publishes it: 0.4.1's chest —
// organization, timeZone, language, currency, tool.teamUrl, tool.publicUrl
// and today(), read exactly as 0.4.1 reads them (each member below is the
// official one's) — with the studio's proposals as more members of the same
// object, so that a tool reads everything about its Chest in one place:
//
//   chest.tools.get("forms")                    // another tool's addresses, chest.tool's shape
//   chest.tools.link("forms", "/chest/forms/5") // a link to a page of it
//   await chest.theme()                         // the look the company chose
//   chest.todayIn(who.timeZone)                 // the date in a member's own zone
//
// What 0.4.1 now gives, the studio dropped: its chest.currency (EUR when
// unset), chest.teamUrl and chest.publicUrl (null outside a Chest) are
// 0.4.1's chest.currency, chest.tool.teamUrl and chest.tool.publicUrl,
// which throw ChestError "not_in_chest" outside a Chest like the others.
export type { Chest } from "../src/chest.js";

// ---- chest.tools: the other tools of the Chest (Studio proposal) -------------
//
// A tool that received an event of another tool links the member back to
// it (Clients and Support to the answer in Forms; Timesheets to Quotes).
// 0.4.1 gives a tool its own addresses (chest.tool, from CHEST_TEAM_URL and
// CHEST_PUBLIC_URL); the proposal gives the others' the same way, in one
// more variable the Chest writes at each start:
//
//   CHEST_TOOL_URLS = {"forms": {"teamUrl": "https://forms-chest.atelier.fr",
//                                "publicUrl": "https://forms.atelier.fr"},
//                      "crm":   {"teamUrl": "https://crm-chest.atelier.fr"}}
//
// one entry per installed tool (by its chest.json name), teamUrl its team
// host, publicUrl its public host while its public part is open (the
// company's own domain when the owner connected one) — chest.tool's shape
// and meaning. The Chest rewrites it when a tool is installed or removed and
// when a public part opens or closes, and starts the awake tools again, as
// for its other variables. CHEST_* names are the Chest's own: no admin
// setting can shadow it (0.4's "env" refuses them).
//
//   chest.tools.get("forms");                     // {teamUrl, publicUrl}, or null: not installed
//   chest.tools.link("forms", "/chest/forms/5/answers/k3abc");
//   chest.tools.link("forms", "/f/contact", { surface: "public" }); // null while closed
//
// An address is an origin as 0.4.1's chest.tool reads them (https, lower
// case, no path); an entry that is not one is ignored — that tool is then
// "not installed" here —, never the whole map. This tool's own name answers
// chest.tool. Store the other tool's name and a path, never an origin
// (it changes with a custom domain), and make the link when rendering. A
// link is not access: the member who follows it may not have that tool;
// its team host then says so.

// A tool's addresses: chest.tool's shape.
export type ToolAddresses = { readonly teamUrl: string; readonly publicUrl: string | null };
export type ToolSurface = "team" | "public";

// A tool's name as chest.json writes it (0.4's grammar of "name").
export const toolNamePattern = /^[a-z][a-z0-9-]{0,47}$/u;
// An origin as 0.4.1's chest module reads CHEST_TEAM_URL.
const originPattern = /^https:\/\/[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?(:[0-9]{1,5})?$/u;
const maxToolUrls = 64 * 1024;
const maxLinkPath = 512;

const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

// readToolUrls checks the map the Chest gives, entry by entry: a name that
// is not a tool's, or a teamUrl that is not an origin, drops that entry; a
// publicUrl that is not one is read as none. Exported for the Chest's own
// tests and the fake Chest.
export function readToolUrls(raw: string | undefined): ReadonlyMap<string, ToolAddresses> {
  const tools = new Map<string, ToolAddresses>();
  if (!raw || raw.length > maxToolUrls) return tools;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return tools;
  }
  if (!record(value)) return tools;
  for (const [name, entry] of Object.entries(value)) {
    if (!toolNamePattern.test(name) || !record(entry)) continue;
    const teamUrl = entry["teamUrl"], publicUrl = entry["publicUrl"];
    if (typeof teamUrl !== "string" || !originPattern.test(teamUrl)) continue;
    tools.set(name, { teamUrl, publicUrl: typeof publicUrl === "string" && originPattern.test(publicUrl) ? publicUrl : null });
  }
  return tools;
}

let parsed: { raw: string; tools: ReadonlyMap<string, ToolAddresses> } | null = null;
const installed = (): ReadonlyMap<string, ToolAddresses> => {
  const raw = process.env["CHEST_TOOL_URLS"] ?? "";
  if (!parsed || parsed.raw !== raw) parsed = { raw, tools: readToolUrls(raw) };
  return parsed.tools;
};

// get is the addresses of a tool installed on this Chest; null when no such
// tool is installed, outside a Chest, or for a name that is not a tool's.
// This tool's own name answers chest.tool (null outside a Chest).
function get(name: string): ToolAddresses | null {
  if (typeof name !== "string" || !toolNamePattern.test(name)) return null;
  const entry = installed().get(name);
  if (entry) return entry;
  if (name !== process.env["CHEST_TOOL"]) return null;
  try {
    return official.tool;
  } catch {
    return null;
  }
}

// A path a link may carry: printable ASCII, no "\", no "//", no "." or
// ".." segment however written, no encoded "/", "\" or NUL — what the
// Chest's front accepts in its simple form.
const linkPath = (path: string): boolean =>
  path.length <= maxLinkPath &&
  /^\/[\x21-\x5b\x5d-\x7e]*$/u.test(path) &&
  !path.includes("//") &&
  !/%(2f|5c|00)/iu.test(path) &&
  !path.split(/[?#]/u)[0]!.split("/").some(s => /^(\.|%2e){1,2}$/iu.test(s));

// link is the absolute address of a page of a tool: its origin on the team
// host (by default) or its public host, and a path that starts with "/" and
// not "//". On the team host a member reaches a tool only under /chest, so a
// team link is "/chest" or under it; a public link is never under /chest
// (the Chest sends that to the team host). null when the tool is not
// installed, has no such surface (no public part, or one not open), or the
// path is not one of these: show the text without a link.
function link(name: string, path: string, options: { surface?: ToolSurface } = {}): string | null {
  const surface = options.surface ?? "team";
  if ((surface !== "team" && surface !== "public") || typeof path !== "string" || !linkPath(path)) return null;
  const underChest = /^\/chest([/?#]|$)/iu.test(path);
  if (surface === "team" ? !/^\/chest([/?#]|$)/u.test(path) : underChest) return null;
  const addresses = get(name);
  const base = addresses === null ? null : surface === "team" ? addresses.teamUrl : addresses.publicUrl;
  if (!base) return null;
  return new URL(base + path).origin === base ? base + path : null;
}

// ---- chest.theme(): the look the company chose (Studio proposal) -------------
//
// The owner chooses once in the Chest's admin — for all tools, and, if they
// want, otherwise for one tool — among three answers:
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
  // dark: the logo's variant for dark pages, if the company gave one.
  logo: { url: string; alt: string; dark: string | null } | null;
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
      if (l["dark"] !== undefined && l["dark"] !== null && !themePath(l["dark"], "svg|png|webp|jpg|jpeg")) return null;
      logo = { url: l["url"], alt: typeof l["alt"] === "string" ? l["alt"].replace(/\p{Cc}/gu, "").trim().slice(0, 120) : name, dark: typeof l["dark"] === "string" ? l["dark"] : null };
    }
    const fonts = value["fonts"] === undefined ? "/_chest/theme/fonts" : value["fonts"];
    if (!fontsBase(fonts)) return null;
    return { mode: "brand", brand: { name, primary: b["primary"], secondary, neutral, corners, density, display, body, logo }, fonts, scope };
  }
  return null;
}

let kept: { api: string; value: ThemeChoice; until: number } | null = null;
let pending: { api: string; answer: Promise<ThemeChoice> } | null = null;

// theme is the look the company chose for this tool (see above): GET /theme
// of the Chest's API.
async function theme(): Promise<ThemeChoice> {
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

// ---- chest.todayIn(): the date in a member's zone (Studio proposal) ----------
//
// 0.4.1's chest.today() is the date in the Chest's zone: what concerns
// everyone (due today, the company's day). What concerns one person — the
// whole days of their leave, "today" on their own page — is their day, in
// member.timeZone. A zone this runtime does not know reads as the Chest's
// (a member's zone must never break their page).

function knownZone(zone: string): boolean {
  if (typeof zone !== "string" || !timeZonePattern.test(zone)) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

function todayIn(zone: string, at: Date | number = Date.now()): string {
  const instant = typeof at === "number" ? new Date(at) : at;
  if (Number.isNaN(instant.getTime())) throw new RangeError("todayIn() needs a valid date");
  const name = knownZone(zone) ? zone : official.timeZone;
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: name, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(instant).map(p => [p.type, p.value]));
  return `${parts["year"]}-${parts["month"]}-${parts["day"]}`;
}

// ---- The object --------------------------------------------------------------

// The members the studio adds to 0.4.1's chest.
export type StudioChest = {
  // The other tools installed on this Chest (see chest.tools above).
  readonly tools: {
    get(name: string): ToolAddresses | null;
    link(name: string, path: string, options?: { surface?: ToolSurface }): string | null;
  };
  // The look the company chose for this tool.
  theme(): Promise<ThemeChoice>;
  // The date in another zone than the Chest's.
  todayIn(zone: string, at?: Date | number): string;
};

// chest is 0.4.1's object, member for member (each getter reads the official
// one at each access), and the studio's members.
export const chest: Chest & StudioChest = {
  get organization() {
    return official.organization;
  },
  get timeZone() {
    return official.timeZone;
  },
  get language() {
    return official.language;
  },
  get currency() {
    return official.currency;
  },
  get tool() {
    return official.tool;
  },
  today(at?: Date | number): string {
    return at === undefined ? official.today() : official.today(at);
  },
  tools: { get, link },
  theme,
  todayIn,
};
