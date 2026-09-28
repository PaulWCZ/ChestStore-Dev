// Safe in the browser: no SDK here.
// What the composer edits (app/chest/composer.tsx), and a new poll's start:
// kept apart from the client component so that server pages can build it.
export type Kind = "choice" | "date" | "survey";
export type Slot = { start: string; end: string };
export type SurveyQuestion = { kind: "choice" | "scale" | "text"; text: string; options: string[]; multiple: boolean; low: string; high: string };

export type ComposerValue = {
  kind: Kind;
  title: string;
  details: string;
  options: string[];
  multiple: boolean;
  other: boolean;
  days: { day: string; slots: Slot[] }[];
  questions: SurveyQuestion[];
  anonymous: boolean;
  results: "live" | "closed";
  everyone: boolean;
  groups: string[];
  closes: { day: string; time: string } | null;
};

export const emptyValue = (kind: Kind): ComposerValue => ({
  kind, title: "", details: "", options: ["", ""], multiple: false, other: false, days: [],
  questions: [{ kind: "scale", text: "", options: ["", ""], multiple: false, low: "", high: "" }],
  anonymous: false, results: "live", everyone: true, groups: [], closes: null,
});

