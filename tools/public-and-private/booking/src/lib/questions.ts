import { AppError } from "./app-error.ts";
import { clean } from "./model.ts";
import { isQuestionKind, newQuestionId, questionKinds, questionLimits, type Answer, type Question, type QuestionKind } from "../shared/kinds.ts";

export { isQuestionKind, newQuestionId, questionKinds, questionLimits, type Answer, type Question, type QuestionKind };

// The host's own questions on a booking type's form, and the guest's
// answers. Pure and browser-safe: the type form uses the same bounds, the
// server checks them again (never trusting what a browser sends).




const idPattern = /^[a-z0-9]{4,12}$/u;

// cleanQuestions checks what a host sends for a type: at most five, each a
// label, a kind, required or not; "one choice" with 2 to 10 distinct
// choices. A question keeps its id (the form's fields are named by it); a
// missing, malformed or repeated id gets a new one.
export function cleanQuestions(value: unknown): Question[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new AppError("invalid");
  if (value.length > questionLimits.perType) throw new AppError("too_many_questions", { max: questionLimits.perType });
  const seen = new Set<string>();
  return value.map((raw: unknown) => {
    if (typeof raw !== "object" || raw === null) throw new AppError("invalid");
    const q = raw as Record<string, unknown>;
    if (!isQuestionKind(q["kind"])) throw new AppError("invalid");
    const label = clean(q["label"], questionLimits.label);
    let options: string[] = [];
    if (q["kind"] === "choice") {
      if (!Array.isArray(q["options"]) || q["options"].length > 50) throw new AppError("invalid");
      options = [...new Set((q["options"] as unknown[]).map(o => clean(o, questionLimits.option, { optional: true })).filter(o => o !== ""))];
      if (options.length < 2) throw new AppError("choices_needed", { question: label });
      if (options.length > questionLimits.options) throw new AppError("too_many_choices", { max: questionLimits.options });
    }
    let id = typeof q["id"] === "string" && idPattern.test(q["id"]) && !seen.has(q["id"]) ? q["id"] : newQuestionId();
    while (seen.has(id)) id = newQuestionId();
    seen.add(id);
    return { id, label, kind: q["kind"], required: q["required"] === true, options };
  });
}

// cleanAnswers reads the guest's answers (by question id) against the
// type's questions as they are now: required ones answered, lengths
// bounded, a choice among the options, yes or no. Unanswered optional
// questions are left out; anything else sent is ignored.
export function cleanAnswers(questions: Question[], input: Record<string, unknown>): Answer[] {
  const answers: Answer[] = [];
  for (const q of questions) {
    const raw = input[q.id];
    const given = raw === undefined || raw === null ? "" : raw;
    if (typeof given !== "string") throw new AppError("invalid");
    let answer: string;
    if (q.kind === "short" || q.kind === "long") {
      try {
        answer = clean(given, q.kind === "short" ? questionLimits.short : questionLimits.long, { optional: true, multiline: q.kind === "long" });
      } catch (error) {
        if (error instanceof AppError && error.code === "too_long") throw new AppError("answer_too_long", { question: q.label, max: error.values["max"] ?? 0 });
        throw error;
      }
    } else if (q.kind === "choice") {
      answer = given.trim();
      if (answer !== "" && !q.options.includes(answer)) throw new AppError("invalid");
    } else {
      answer = given.trim();
      if (answer !== "" && answer !== "yes" && answer !== "no") throw new AppError("invalid");
    }
    if (answer === "") {
      if (q.required) throw new AppError("answer_missing", { question: q.label });
      continue;
    }
    answers.push({ id: q.id, label: q.label, kind: q.kind, answer });
  }
  return answers;
}

// Reading what the database holds (written by the functions above; read
// defensively all the same).
export function readQuestions(value: unknown): Question[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((q: Record<string, unknown>) =>
    q && typeof q["id"] === "string" && typeof q["label"] === "string" && isQuestionKind(q["kind"])
      ? [{ id: q["id"], label: q["label"], kind: q["kind"], required: q["required"] === true, options: Array.isArray(q["options"]) ? q["options"].filter((o): o is string => typeof o === "string") : [] }]
      : [],
  );
}

export function readAnswers(value: unknown): Answer[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((a: Record<string, unknown>) =>
    a && typeof a["id"] === "string" && typeof a["label"] === "string" && isQuestionKind(a["kind"]) && typeof a["answer"] === "string" ? [{ id: a["id"], label: a["label"], kind: a["kind"], answer: a["answer"] }] : [],
  );
}

// An answer in words: yes and no in the reader's language.
export function answerText(a: Pick<Answer, "kind" | "answer">, words: { yes: string; no: string }): string {
  if (a.kind === "yesno") return a.answer === "yes" ? words.yes : words.no;
  return a.answer;
}
