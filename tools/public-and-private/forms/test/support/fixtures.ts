import { newId, type Definition, type Question } from "../../src/shared/model.ts";

// Small forms for the tests, built by hand so every id is known.
export const q = (kind: Question["kind"], title: string, extra: Partial<Question> = {}): Question => ({ id: newId(), kind, title, help: "", required: false, ...extra });
export const opts = (...labels: string[]) => labels.map(label => ({ id: newId(), label }));

export function oneQuestion(question: Question, title = "Test form"): Definition {
  return { title, intro: "", pages: [{ id: newId(), title: "", questions: [question], jumps: [] }] };
}

export function form(questions: Question[], title = "Test form"): Definition {
  return { title, intro: "", pages: [{ id: newId(), title: "", questions, jumps: [] }] };
}
