import { catalogue, locales, type Catalogue } from "./i18n/index.ts";
import type { Examples } from "./journeys.ts";

// The two example templates offered on an empty page, in the words of the
// catalogue HR reads: who does each step, and on which day. Each step
// carries the key of its words (its phrase), so every reader sees it in
// their own language until HR rewords it (lib/journeys.ts).
export function examples(t: Catalogue): Examples {
  const on = t.checklists.examples.onboarding;
  const off = t.checklists.examples.offboarding;
  return {
    onboarding: {
      name: on.name,
      items: [
        { text: on.items.laptop, phrase: "onboarding.laptop", role: "hr", offset: -14 },
        { text: on.items.accounts, phrase: "onboarding.accounts", role: "hr", offset: -3 },
        { text: on.items.desk, phrase: "onboarding.desk", role: "hr", offset: -1 },
        { text: on.items.welcome, phrase: "onboarding.welcome", role: "manager", offset: 0 },
        { text: on.items.lunch, phrase: "onboarding.lunch", role: "manager", offset: 0 },
        { text: on.items.profile, phrase: "onboarding.profile", role: "person", offset: 1 },
        { text: on.items.handbook, phrase: "onboarding.handbook", role: "person", offset: 2 },
        { text: on.items.goals, phrase: "onboarding.goals", role: "manager", offset: 7 },
        { text: on.items.checkIn, phrase: "onboarding.checkIn", role: "manager", offset: 30 },
      ],
    },
    offboarding: {
      name: off.name,
      items: [
        { text: off.items.handover, phrase: "offboarding.handover", role: "manager", offset: -14 },
        { text: off.items.farewell, phrase: "offboarding.farewell", role: "manager", offset: -1 },
        { text: off.items.equipment, phrase: "offboarding.equipment", role: "person", offset: 0 },
        { text: off.items.access, phrase: "offboarding.access", role: "hr", offset: 0 },
        { text: off.items.documents, phrase: "offboarding.documents", role: "hr", offset: 0 },
      ],
    },
  };
}

// The step that asks the newcomer to fill in their profile: ticked by
// itself once they did.
export const profilePhrase = "onboarding.profile";

// The words of a phrase in one catalogue, or null for a key it does not
// know.
export function phraseIn(t: Catalogue, phrase: string | null): string | null {
  if (!phrase) return null;
  const [kind, key] = phrase.split(".") as [string, string];
  if (kind !== "onboarding" && kind !== "offboarding") return null;
  const items = t.checklists.examples[kind].items as Record<string, string>;
  return Object.hasOwn(items, key) ? items[key]! : null;
}

// How a reader sees a step: its phrase in their language, or the words HR
// wrote.
export function stepText(item: { text: string; phrase: string | null }, t: Catalogue): string {
  return phraseIn(t, item.phrase) ?? item.text;
}

// How a reader sees an example template's (or its checklist's) name: the
// example's name in their language while HR has not renamed it.
export function listName(x: { name: string; phrase: string | null }, t: Catalogue): string {
  return x.phrase === "onboarding" || x.phrase === "offboarding" ? t.checklists.examples[x.phrase].name : x.name;
}

// Whether a name is still the example's own words in one of the languages.
export function sameName(kind: string, text: string): boolean {
  return (kind === "onboarding" || kind === "offboarding") && locales.some(l => catalogue(l).checklists.examples[kind].name === text);
}

// Whether a text is still the phrase's own words in one of the languages
// (HR saved a step without rewording it): then the phrase is kept.
export function samePhrase(phrase: string | null, text: string): boolean {
  return phrase !== null && locales.some(l => phraseIn(catalogue(l), phrase) === text);
}
