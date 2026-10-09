// What a booking type is made of, as the browser's forms need it too (the
// type form, the questions, the week's hours): pure, browser-safe — no SDK,
// no database, no refusal. The services (src/lib/model.ts, questions.ts,
// slots.ts) check what is sent against the same bounds, and re-export these.

export const colors = ["sky", "sea", "leaf", "sun", "tomato", "berry", "grape", "slate"] as const;
export type Color = (typeof colors)[number];
export const isColor = (v: unknown): v is Color => typeof v === "string" && (colors as readonly string[]).includes(v);

export const locationKinds = ["place", "phone", "video", "other"] as const;
export type LocationKind = (typeof locationKinds)[number];
export const isLocationKind = (v: unknown): v is LocationKind => typeof v === "string" && (locationKinds as readonly string[]).includes(v);

// Durations and steps a host picks from.
export const durations = [15, 20, 30, 45, 60, 90, 120] as const;

// The tool's own routes: never the address of a host's page or a type's.
// Every "chest-…" address is the Chest's (chest-events, chest-schedules…).
const routes = new Set(["chest", "b", "feed", "lang", "api", "actions", "assets", "look.css", "_next", "_chest", "icon.svg", "favicon.ico", "robots.txt"]);
export const reserved = { has: (slug: string): boolean => routes.has(slug) || slug.startsWith("chest-") };

// A slug from a name: "Léa Dubois" → "lea-dubois".
export function slugify(text: string): string {
  const base = text.normalize("NFD").replace(/\p{Mn}/gu, "").toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "").slice(0, 40).replace(/-+$/u, "");
  return base.length >= 1 && !reserved.has(base) ? base : "page";
}

export const questionKinds = ["short", "long", "choice", "yesno"] as const;
export type QuestionKind = (typeof questionKinds)[number];
export const isQuestionKind = (v: unknown): v is QuestionKind => typeof v === "string" && (questionKinds as readonly string[]).includes(v);

export type Question = { id: string; label: string; kind: QuestionKind; required: boolean; options: string[] };
// What the guest answered, with the question as they saw it (a later edit
// of the type does not change a booking).
export type Answer = { id: string; label: string; kind: QuestionKind; answer: string };

export const questionLimits = { perType: 5, label: 200, options: 10, option: 80, short: 300, long: 2000 } as const;

export function newQuestionId(): string {
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);
  return [...bytes].map(b => (b % 36).toString(36)).join("");
}

// Hours of a day: [start, end] minutes after midnight, sorted, apart.
export type Ranges = [number, number][];

export function validRanges(value: unknown): value is Ranges {
  if (!Array.isArray(value) || value.length > 8) return false;
  const ranges = value as unknown[];
  if (!ranges.every(r => Array.isArray(r) && r.length === 2 && r.every(x => Number.isInteger(x)) && (r[0] as number) >= 0 && (r[1] as number) <= 1440 && (r[0] as number) < (r[1] as number))) return false;
  const sorted = [...(ranges as Ranges)].sort((a, b) => a[0] - b[0]);
  return sorted.every((r, i) => i === 0 || r[0] >= sorted[i - 1]![1]);
}

// A type's colour as a class (src/styles.css): its edge, its sheet, its
// swatch — never a style attribute.
export const typeClass: Record<Color, string> = { sky: "type-sky", sea: "type-sea", leaf: "type-leaf", sun: "type-sun", tomato: "type-tomato", berry: "type-berry", grape: "type-grape", slate: "type-slate" };
export const swatchClass: Record<Color, string> = { sky: "sw-sky", sea: "sw-sea", leaf: "sw-leaf", sun: "sw-sun", tomato: "sw-tomato", berry: "sw-berry", grape: "sw-grape", slate: "sw-slate" };
