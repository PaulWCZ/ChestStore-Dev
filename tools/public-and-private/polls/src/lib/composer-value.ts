// Safe in the browser: no SDK here.
// What the composer edits (app/chest/composer.tsx), and a new poll's start:
// kept apart from the client component so that server pages can build it.
export type Kind = "choice" | "date" | "survey";
export type Slot = { start: string; end: string };
export type SurveyQuestion = { kind: "choice" | "scale" | "text" | "enps"; text: string; options: string[]; multiple: boolean; low: string; high: string };

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
  // People picked by name (their names for the composer only; the server
  // keeps ids).
  people: { id: string; name: string }[];
  closes: { day: string; time: string } | null;
  // A sign-up sheet: places per answer.
  slots: number | null;
  // A survey that comes back.
  repeat: "week" | "month" | null;
};

export const emptyValue = (kind: Kind): ComposerValue => ({
  kind, title: "", details: "", options: ["", ""], multiple: false, other: false, days: [],
  questions: [{ kind: "scale", text: "", options: ["", ""], multiple: false, low: "", high: "" }],
  anonymous: false, results: "live", everyone: true, groups: [], people: [], closes: null, slots: null, repeat: null,
});

// The team pulse (Officevibe-style): anonymous, every week, three short
// questions — how the week was (1–5), eNPS (0–10), anything to say.
export const pulseValue = (w: { title: string; scale: string; low: string; high: string; enps: string; text: string }): ComposerValue => ({
  ...emptyValue("survey"),
  title: w.title,
  questions: [
    { kind: "scale", text: w.scale, options: ["", ""], multiple: false, low: w.low, high: w.high },
    { kind: "enps", text: w.enps, options: ["", ""], multiple: false, low: "", high: "" },
    { kind: "text", text: w.text, options: ["", ""], multiple: false, low: "", high: "" },
  ],
  anonymous: true,
  results: "closed",
  repeat: "week",
});
