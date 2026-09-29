// Safe in the browser: the templates a new form starts from, in the
// member's language. Their words are in the catalogues (templates.*): a new
// language translates them there, nothing here.
import type { Catalogue } from "./i18n/index.ts";
import { blank, isLanguage, newId, newQuestion, type Definition, type Kind, type Question, type Settings } from "./model.ts";

export const templateKeys = ["blank", "contact", "event", "feedback", "job", "it", "pulse"] as const;
export type TemplateKey = (typeof templateKeys)[number];
export const isTemplate = (v: unknown): v is TemplateKey => typeof v === "string" && (templateKeys as readonly string[]).includes(v);

type Extra = Partial<Omit<Question, "id" | "kind" | "title" | "options">> & { options?: string[] };
function q(kind: Kind, title: string, extra: Extra = {}): Question {
  const base = newQuestion(kind);
  const { options, ...rest } = extra;
  return { ...base, title, ...rest, ...(options ? { options: options.map(label => ({ id: newId(), label })) } : {}) };
}
const page = (questions: Question[], title = "") => ({ id: newId(), title, questions, jumps: [] as Definition["pages"][number]["jumps"] });

// routes: the links to the other tools a template starts with, turned on
// when the receiving tool is installed on the Chest (the mapping is
// guessRoutes'); the Contact form becomes a contact in Clients.
export type Template = { definition: Definition; settings: Partial<Pick<Settings, "audience" | "once" | "layout" | "accent" | "sendCopy" | "anonymous">>; routes?: { contact?: boolean; request?: boolean } };

// A new form is written in the language of the person who starts it: the
// respondent's page then speaks that language, or the form's second one.
export function template(key: TemplateKey, t: Catalogue): Template {
  const made = build(key, t);
  if (isLanguage(t.meta.lang)) made.definition.language = t.meta.lang;
  return made;
}

function build(key: TemplateKey, t: Catalogue): Template {
  const w = t.templates;
  switch (key) {
    case "blank":
      return { definition: blank(), settings: {} };
    case "contact": {
      const c = w.contact;
      return {
        definition: { title: c.title, intro: c.intro, pages: [page([
          q("short", c.name_, { required: true }),
          q("email", c.email, { required: true }),
          q("phone", c.phone),
          q("short", c.company),
          q("choice", c.topic, { required: true, options: [c.topicQuestion, c.topicQuote, c.topicOrder], other: true }),
          q("long", c.message, { required: true, max: 2000 }),
        ])] },
        settings: { audience: "public", layout: "classic", accent: "indigo", sendCopy: true },
        routes: { contact: true },
      };
    }
    case "event": {
      const e = w.event;
      const lunch = q("yesno", e.lunch, { required: true });
      const diet = q("short", e.diet, { showIf: { question: lunch.id, op: "is", value: true } });
      return {
        definition: { title: e.title, intro: e.intro, pages: [page([
          q("short", e.name_, { required: true }),
          q("email", e.email, { required: true }),
          q("short", e.company),
          q("number", e.people, { required: true, min: 1, max: 10 }),
          lunch,
          diet,
          q("long", e.notes),
        ])] },
        settings: { audience: "public", layout: "classic", accent: "tangerine", sendCopy: true },
      };
    }
    case "feedback": {
      const f = w.feedback;
      const score = q("scale", f.recommend, { required: true, from: 0, to: 10, left: f.notLikely, right: f.veryLikely });
      const love = page([q("long", f.liked)], "");
      const better = page([q("long", f.better)], "");
      const contact = q("yesno", f.contact);
      const last = page([contact, q("email", f.email, { required: true, showIf: { question: contact.id, op: "is", value: true } })], "");
      const first = page([q("rating", f.service, { required: true, steps: 5 }), score], "");
      first.jumps = [{ when: { question: score.id, op: "lt", value: 7 }, to: better.id }];
      love.jumps = [{ when: { question: score.id, op: "answered" }, to: last.id }];
      return { definition: { title: f.title, intro: f.intro, pages: [first, love, better, last] }, settings: { audience: "public", layout: "steps", accent: "berry" } };
    }
    case "job": {
      const j = w.job;
      return {
        definition: { title: j.title, intro: j.intro, pages: [page([
          q("short", j.name_, { required: true }),
          q("email", j.email, { required: true }),
          q("phone", j.phone),
          q("short", j.position, { required: true }),
          q("file", j.cv, { required: true, accept: "documents", help: j.cvHelp }),
          q("short", j.link),
          q("long", j.why, { max: 3000 }),
          q("date", j.start),
        ])] },
        settings: { audience: "public", layout: "classic", accent: "forest", sendCopy: true },
      };
    }
    case "it": {
      const i = w.it;
      const need = q("choice", i.need, { required: true, options: [i.needBroken, i.needNew, i.needAccess], other: true });
      return {
        definition: { title: i.title, intro: i.intro, pages: [page([
          need,
          q("dropdown", i.device, { options: [i.deviceLaptop, i.devicePhone, i.devicePrinter, i.deviceScreen], showIf: { question: need.id, op: "is_not", value: need.options![2]!.id } }),
          q("choice", i.urgency, { required: true, options: [i.urgencyBlocked, i.urgencySlow, i.urgencyWait] }),
          q("long", i.describe, { required: true }),
          q("file", i.screenshot, { accept: "images" }),
        ])] },
        settings: { audience: "team", once: false, layout: "classic", accent: "teal" },
      };
    }
    case "pulse": {
      const p = w.pulse;
      return {
        definition: { title: p.title, intro: p.intro, pages: [page([
          q("rating", p.week, { required: true, steps: 5 }),
          q("scale", p.workload, { required: true, from: 1, to: 5, left: p.workloadLow, right: p.workloadHigh }),
          q("choices", p.helped, { options: [p.helpedTeam, p.helpedTools, p.helpedFocus, p.helpedRecognition], max: 2 }),
          q("long", p.oneThing),
        ])] },
        settings: { audience: "team", anonymous: true, once: true, layout: "steps", accent: "ink" },
      };
    }
  }
}
