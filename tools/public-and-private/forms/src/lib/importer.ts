// Safe in the browser: no SDK, no database. Importing a form's questions
// from the tool a company leaves:
//
// - Google Forms: the form as its API gives it (forms.get: `info`,
//   `items`) — the field names of Google's own client, @googleapis/forms
//   11.0.1, v1.ts (Apache-2.0), read on 2026-09-29;
// - Typeform: the form as its Create API gives it (GET /forms/{id}:
//   `title`, `fields`, `welcome_screens`) — the field names of Typeform's
//   own client, @typeform/api-client 2.8.0, dist/typeform-types.d.ts
//   (MIT), read on 2026-09-29.
//
// Only the questions come in (their kinds, options, required, limits,
// pages); what Forms does not do (payments, a Calendly booking) and what
// cannot come as it is (logic rules, pictures, videos, scoring) is listed,
// never guessed. The result is an ordinary draft: definition() reads it
// again on the server.
import { AppError } from "./app-error.ts";
import { isLanguage, limits, newId, type Definition, type Kind, type Option, type Page, type Question } from "../shared/model.ts";

export type Skipped = "logic" | "picture" | "video" | "payment" | "booking" | "grading" | "other";
export type Imported = { definition: Definition; source: "google" | "typeform"; skipped: Skipped[]; questions: number };

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => v !== null && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown, max: number) => (typeof v === "string" ? [...v.replace(/\r\n?/gu, "\n").trim()].slice(0, max).join("") : "");
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const options = (labels: string[]): Option[] => labels.filter(Boolean).slice(0, limits.options).map(label => ({ id: newId(), label: text(label, limits.option) }));
const clamp = (n: number, low: number, high: number) => Math.min(high, Math.max(low, Math.round(n)));

function question(kind: Kind, title: string, extra: Partial<Question> = {}): Question {
  return { id: newId(), kind, title: text(title, limits.questionTitle), help: "", required: false, ...extra };
}

export function importForm(raw: unknown): Imported {
  let value = raw;
  if (typeof raw === "string") {
    if (raw.length > 2 << 20) throw new AppError("import_invalid");
    try {
      value = JSON.parse(raw);
    } catch {
      throw new AppError("import_invalid");
    }
  }
  if (!isObject(value)) throw new AppError("import_invalid");
  if (Array.isArray(value["items"]) || isObject(value["info"])) return fromGoogle(value);
  if (Array.isArray(value["fields"])) return fromTypeform(value);
  throw new AppError("import_invalid");
}

function finish(title: string, intro: string, pages: Page[], source: Imported["source"], skipped: Set<Skipped>, language?: string): Imported {
  const kept = pages.filter((p, i) => i === 0 || p.questions.length > 0 || p.title).slice(0, limits.pages);
  let count = 0;
  for (const p of kept) {
    p.questions = p.questions.slice(0, Math.max(0, limits.questions - count));
    count += p.questions.length;
  }
  const definition: Definition = { title: text(title, limits.title), intro: text(intro, limits.intro), pages: kept.length ? kept : [{ id: newId(), title: "", questions: [], jumps: [] }] };
  if (isLanguage(language)) definition.language = language;
  return { definition, source, skipped: [...skipped], questions: count };
}

// ---- Google Forms --------------------------------------------------------------

function fromGoogle(form: Json): Imported {
  const info = isObject(form["info"]) ? form["info"] : {};
  const skipped = new Set<Skipped>();
  const pages: Page[] = [{ id: newId(), title: "", questions: [], jumps: [] }];
  const page = () => pages.at(-1)!;
  for (const item of arr(form["items"])) {
    if (!isObject(item)) continue;
    const title = text(item["title"], limits.questionTitle);
    const description = text(item["description"], limits.help);
    if (isObject(item["pageBreakItem"])) {
      pages.push({ id: newId(), title: text(item["title"], limits.pageTitle), questions: [], jumps: [] });
      continue;
    }
    if (isObject(item["textItem"])) {
      page().questions.push(question("statement", title, { help: description }));
      continue;
    }
    if (isObject(item["imageItem"])) { skipped.add("picture"); continue; }
    if (isObject(item["videoItem"])) { skipped.add("video"); continue; }
    const group = item["questionGroupItem"];
    if (isObject(group) && isObject(group["grid"])) {
      const columns = isObject(group["grid"]["columns"]) ? arr(group["grid"]["columns"]["options"]) : [];
      const rows = arr(group["questions"]).filter(isObject);
      page().questions.push(question("matrix", title, {
        help: description,
        required: rows.some(r => r["required"] === true),
        rows: options(rows.map(r => (isObject(r["rowQuestion"]) ? text(r["rowQuestion"]["title"], limits.option) : ""))).slice(0, limits.rows),
        options: options(columns.map(c => (isObject(c) ? text(c["value"], limits.option) : ""))).slice(0, limits.columns),
      }));
      continue;
    }
    const q = isObject(item["questionItem"]) && isObject(item["questionItem"]["question"]) ? item["questionItem"]["question"] : null;
    if (!q) { skipped.add("other"); continue; }
    if (isObject(q["grading"])) skipped.add("grading");
    const required = q["required"] === true;
    const base = { help: description, required };
    const choice = q["choiceQuestion"];
    if (isObject(choice)) {
      const opts = arr(choice["options"]).filter(isObject);
      if (opts.some(o => o["goToAction"] || o["goToSectionId"])) skipped.add("logic");
      if (opts.some(o => isObject(o["image"]))) skipped.add("picture");
      const kind: Kind = choice["type"] === "CHECKBOX" ? "choices" : choice["type"] === "DROP_DOWN" ? "dropdown" : "choice";
      const other = kind !== "dropdown" && opts.some(o => o["isOther"] === true);
      page().questions.push(question(kind, title, { ...base, options: options(opts.filter(o => o["isOther"] !== true).map(o => text(o["value"], limits.option))), ...(other ? { other: true } : {}) }));
    } else if (isObject(q["textQuestion"])) {
      page().questions.push(question(q["textQuestion"]["paragraph"] === true ? "long" : "short", title, base));
    } else if (isObject(q["scaleQuestion"])) {
      const s = q["scaleQuestion"];
      const low = typeof s["low"] === "number" ? s["low"] : 1;
      const high = typeof s["high"] === "number" ? s["high"] : 5;
      page().questions.push(question("scale", title, { ...base, from: clamp(low, 0, 1), to: clamp(high, 5, 10), left: text(s["lowLabel"], 60), right: text(s["highLabel"], 60) }));
    } else if (isObject(q["ratingQuestion"])) {
      const level = q["ratingQuestion"]["ratingScaleLevel"];
      page().questions.push(question("rating", title, { ...base, steps: clamp(typeof level === "number" ? level : 5, 3, 10) }));
    } else if (isObject(q["dateQuestion"])) {
      page().questions.push(question("date", title, base));
    } else if (isObject(q["timeQuestion"])) {
      page().questions.push(question("short", title, { ...base, max: 20 }));
    } else if (isObject(q["fileUploadQuestion"])) {
      const f = q["fileUploadQuestion"];
      const max = typeof f["maxFiles"] === "number" ? clamp(f["maxFiles"], 1, limits.files) : 1;
      const types = arr(f["types"]);
      const accept = types.length > 0 && types.every(t => t === "IMAGE") ? "images" : types.length > 0 && types.every(t => t === "DOCUMENT" || t === "PDF" || t === "SPREADSHEET" || t === "PRESENTATION") ? "documents" : "any";
      page().questions.push(question("file", title, { ...base, accept, ...(max > 1 ? { max } : {}) }));
    } else skipped.add("other");
  }
  return finish(text(info["title"], limits.title) || text(info["documentTitle"], limits.title), text(info["description"], limits.intro), pages, "google", skipped);
}

// ---- Typeform ----------------------------------------------------------------------

function fromTypeform(form: Json): Imported {
  const skipped = new Set<Skipped>();
  if (arr(form["logic"]).length > 0) skipped.add("logic");
  const questions: Question[] = [];
  const add = (field: Json) => {
    const type = field["type"];
    const title = text(field["title"], limits.questionTitle);
    const p = isObject(field["properties"]) ? field["properties"] : {};
    const v = isObject(field["validations"]) ? field["validations"] : {};
    const base = { help: text(p["description"], limits.help), required: v["required"] === true };
    const labels = (list: unknown) => arr(list).filter(isObject).map(c => text(c["label"], limits.option));
    const many = p["allow_multiple_selection"] === true;
    switch (type) {
      case "short_text":
      case "website":
      case "address":
        return questions.push(question("short", title, { ...base, ...(typeof v["max_length"] === "number" ? { max: clamp(v["max_length"], 1, limits.short) } : {}) }));
      case "long_text":
        return questions.push(question("long", title, { ...base, ...(typeof v["max_length"] === "number" ? { max: clamp(v["max_length"], 1, limits.long) } : {}) }));
      case "email":
        return questions.push(question("email", title, base));
      case "phone_number":
        return questions.push(question("phone", title, base));
      case "number":
        return questions.push(question("number", title, { ...base, ...(typeof v["min_value"] === "number" ? { min: v["min_value"] } : {}), ...(typeof v["max_value"] === "number" ? { max: v["max_value"] } : {}) }));
      case "multiple_choice":
      case "picture_choice": {
        if (type === "picture_choice") skipped.add("picture");
        return questions.push(question(many ? "choices" : "choice", title, { ...base, options: options(labels(p["choices"])), ...(p["allow_other_choice"] === true ? { other: true } : {}) }));
      }
      case "dropdown":
        return questions.push(question("dropdown", title, { ...base, options: options(labels(p["choices"])) }));
      case "ranking":
        return questions.push(question("ranking", title, { ...base, options: options(labels(p["choices"])).slice(0, limits.rankItems) }));
      case "yes_no":
      case "legal":
        return questions.push(question("yesno", title, base));
      case "rating":
        return questions.push(question("rating", title, { ...base, steps: clamp(typeof p["steps"] === "number" ? p["steps"] : 5, 3, 10) }));
      case "opinion_scale":
      case "nps": {
        const from = type === "nps" ? 0 : p["start_at_one"] === true ? 1 : 0;
        const steps = type === "nps" ? 11 : typeof p["steps"] === "number" ? p["steps"] : 11;
        const labelsOf = isObject(p["labels"]) ? p["labels"] : {};
        return questions.push(question("scale", title, { ...base, from, to: clamp(from + steps - 1, 5, 10), left: text(labelsOf["left"], 60), right: text(labelsOf["right"], 60) }));
      }
      case "date":
        return questions.push(question("date", title, base));
      case "file_upload":
        return questions.push(question("file", title, { ...base, accept: "any" }));
      case "statement":
        return questions.push(question("statement", title, { help: base.help }));
      case "matrix": {
        const rows = arr(p["fields"]).filter(isObject);
        const columns = rows[0] && isObject(rows[0]["properties"]) ? labels(rows[0]["properties"]["choices"]) : [];
        return questions.push(question("matrix", title, { ...base, rows: options(rows.map(r => text(r["title"], limits.option))).slice(0, limits.rows), options: options(columns).slice(0, limits.columns) }));
      }
      case "contact_info":
        for (const sub of arr(p["fields"]).filter(isObject)) add(sub);
        return;
      case "group":
        questions.push(question("statement", title, { help: base.help }));
        for (const sub of arr(p["fields"]).filter(isObject)) add(sub);
        return;
      case "payment":
        skipped.add("payment");
        return;
      case "calendly":
        skipped.add("booking");
        return;
      default:
        skipped.add("other");
    }
  };
  for (const field of arr(form["fields"])) if (isObject(field)) add(field);
  const welcome = arr(form["welcome_screens"]).find(isObject);
  const intro = welcome ? [text(welcome["title"], limits.intro), isObject(welcome["properties"]) ? text(welcome["properties"]["description"], limits.intro) : ""].filter(Boolean).join("\n\n") : "";
  return finish(text(form["title"], limits.title), intro, [{ id: newId(), title: "", questions, jumps: [] }], "typeform", skipped, typeof form["language"] === "string" ? form["language"] : undefined);
}
