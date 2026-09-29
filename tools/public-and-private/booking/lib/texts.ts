import { AppError } from "./app-error.ts";
import { isLocale, locales, type Locale } from "./i18n/index.ts";
import { clean, limits } from "./model.ts";
import { questionLimits, type Question } from "./questions.ts";

// A host's texts in two languages. Pure and browser-safe (the type form
// uses the same keys and bounds; the server checks them again).
//
// A host writes their welcome, their types and their questions in one
// language (`language`), and may give a second version of them
// (`second`). A visitor reads a host's page in their own language when the
// host has it, otherwise in the host's first language — the tool's own
// words follow, so a page never mixes two languages (a French visitor
// never sees English questions with « Oui / Non »). A host who never said
// their language (hosts made before this version, until they open the
// tool again) follows the visitor, as before.

export type HostLanguages = { language: Locale | null; second: Locale | null };

// The languages a host's page can be read in (its language switch shows
// only these).
export function pageLanguages(host: HostLanguages): Locale[] {
  if (!host.language) return [...locales];
  return host.second ? [host.language, host.second] : [host.language];
}

// The language a visitor reads a host's page in.
export function pageLanguage(host: HostLanguages, wanted: Locale): Locale {
  if (!host.language || wanted === host.language || wanted === host.second) return wanted;
  return host.language;
}

// Reading what a host sends: a language, and a second one that differs.
export function cleanLanguages(language: unknown, second: unknown): { language: Locale; second: Locale | null } {
  if (!isLocale(language)) throw new AppError("invalid");
  if (second === null || second === undefined || second === "") return { language, second: null };
  if (!isLocale(second) || second === language) throw new AppError("invalid");
  return { language, second };
}

// A type's texts in the second language: "title", "description", a
// question's id (its label), "<question id>.<n>" (its n-th choice).
export type TypeTexts = Record<string, string>;
const keyPattern = /^(title|description|[a-z0-9]{4,12}(\.[0-9]{1,2})?)$/u;

// cleanTypeTexts keeps the texts that translate something the type has,
// each bounded like the text it translates; empty ones are dropped (the
// first language shows there).
export function cleanTypeTexts(value: unknown, questions: Question[]): TypeTexts {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object" || Array.isArray(value)) throw new AppError("invalid");
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > 2 + questionLimits.perType * (1 + questionLimits.options + 5)) throw new AppError("invalid");
  const byId = new Map(questions.map(q => [q.id, q]));
  const out: TypeTexts = {};
  for (const [key, raw] of entries) {
    if (!keyPattern.test(key)) throw new AppError("invalid");
    let max: number;
    let multiline = false;
    if (key === "title") max = limits.title;
    else if (key === "description") {
      max = limits.description;
      multiline = true;
    } else {
      const [id = "", n] = key.split(".");
      const q = byId.get(id);
      // A text of a question that is gone, or of a choice it no longer
      // has: nothing to translate, left out.
      if (!q || (n !== undefined && (q.kind !== "choice" || Number(n) >= q.options.length))) continue;
      max = n === undefined ? questionLimits.label : questionLimits.option;
    }
    const text = clean(raw, max, { optional: true, multiline });
    if (text !== "") out[key] = text;
  }
  return out;
}

export function readTypeTexts(value: unknown): TypeTexts {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter((e): e is [string, string] => keyPattern.test(e[0]) && typeof e[1] === "string" && e[1] !== ""));
}

type Localizable = { title: string; description: string; questions: Question[]; alt: TypeTexts };

// localizeType: a type as it reads in a language — the second language's
// texts where the host wrote them, the first language's elsewhere. Ids and
// rules stay the same, so answers are checked against what the guest saw
// (a choice's answer is the choice in the guest's language).
export function localizeType<T extends Localizable>(type: T, host: HostLanguages, language: Locale): T {
  if (!host.second || language !== host.second || host.second === host.language) return type;
  const t = type.alt;
  return {
    ...type,
    title: t["title"] || type.title,
    description: t["description"] || type.description,
    questions: type.questions.map(q => ({ ...q, label: t[q.id] || q.label, options: q.options.map((o, i) => t[`${q.id}.${i}`] || o) })),
  };
}

export function localizeWelcome(host: HostLanguages & { welcome: string; welcomeAlt: string }, language: Locale): string {
  if (host.second && language === host.second && host.welcomeAlt) return host.welcomeAlt;
  return host.welcome;
}
