import assert from "node:assert/strict";
import { test } from "node:test";
import { field } from "@argentic/chest-app";
import { answerText, asked, check, matches, prefill, read, walk } from "../src/shared/logic.ts";
import { END, type Definition } from "../src/shared/model.ts";
import { form, opts, q } from "./support/fixtures.ts";

// The logic engine: which questions are asked, which page comes next, and
// what the server keeps of what was sent.

function feedback(): { def: Definition; score: string; liked: string; better: string; contact: string; email: string } {
  const score = q("scale", "Recommend?", { required: true, from: 0, to: 10 });
  const liked = q("long", "What did you like?");
  const better = q("long", "What should we do better?", { required: true });
  const contact = q("yesno", "May we contact you?");
  const email = q("email", "Your email", { required: true, showIf: { question: contact.id, op: "is", value: true } });
  const def: Definition = {
    title: "Feedback",
    intro: "",
    pages: [
      { id: "pagefirst", title: "", questions: [score], jumps: [{ when: { question: score.id, op: "lt", value: 7 }, to: "pagebettr" }] },
      { id: "pagelovee", title: "", questions: [liked], jumps: [{ when: { question: score.id, op: "answered" }, to: "pagelastt" }] },
      { id: "pagebettr", title: "", questions: [better], jumps: [] },
      { id: "pagelastt", title: "", questions: [contact, email], jumps: [] },
    ],
  };
  return { def, score: score.id, liked: liked.id, better: better.id, contact: contact.id, email: email.id };
}

test("a high score skips the page for detractors; a low one skips the page for promoters", () => {
  const f = feedback();
  assert.deepEqual(walk(f.def, { [f.score]: 9 }).pages.map(p => p.page.id), ["pagefirst", "pagelovee", "pagelastt"]);
  assert.deepEqual(walk(f.def, { [f.score]: 3 }).pages.map(p => p.page.id), ["pagefirst", "pagebettr", "pagelastt"]);
});

test("a question shown only if an earlier answer matches", () => {
  const f = feedback();
  const without = asked(walk(f.def, { [f.score]: 9, [f.contact]: false })).map(x => x.id);
  assert.ok(!without.includes(f.email));
  const withIt = asked(walk(f.def, { [f.score]: 9, [f.contact]: true })).map(x => x.id);
  assert.ok(withIt.includes(f.email));
});

test("the server keeps only answers to questions asked, and asks for required ones asked", () => {
  const f = feedback();
  // A promoter who also typed an answer on the detractors' page (another
  // tab, a forged request): that answer is dropped, never stored.
  const { answers, errors } = check(f.def, { [f.score]: 10, [f.liked]: "Speed", [f.better]: "Nothing", [f.contact]: true });
  assert.deepEqual(Object.keys(answers).sort(), [f.score, f.liked, f.contact].sort());
  assert.deepEqual(errors, { [f.email]: "required" });
  // A detractor must say what to do better.
  assert.deepEqual(check(f.def, { [f.score]: 2 }).errors, { [f.better]: "required" });
  assert.deepEqual(check(f.def, {}).errors, { [f.score]: "required", [f.better]: "required" });
  assert.deepEqual(check(f.def, "not an object").errors, { [f.score]: "required", [f.better]: "required" });
});

test("a jump to the end sends the form", () => {
  const stop = q("yesno", "Stop here?");
  const later = q("short", "Later", { required: true });
  const def: Definition = { title: "t", intro: "", pages: [
    { id: "pageonee", title: "", questions: [stop], jumps: [{ when: { question: stop.id, op: "is", value: true }, to: END }] },
    { id: "pagetwoo", title: "", questions: [later], jumps: [] },
  ] };
  assert.deepEqual(check(def, { [stop.id]: true }).errors, {});
  assert.deepEqual(check(def, { [stop.id]: false }).errors, { [later.id]: "required" });
});

test("a jump backwards or to a missing page never loops", () => {
  const a = q("short", "A");
  const def: Definition = { title: "t", intro: "", pages: [
    { id: "pageonee", title: "", questions: [], jumps: [] },
    { id: "pagetwoo", title: "", questions: [a], jumps: [{ when: { question: a.id, op: "answered" }, to: "pageonee" }] },
  ] };
  assert.equal(walk(def, { [a.id]: "x" }).pages.length, 2);
});

test("each kind reads its answer strictly", () => {
  assert.deepEqual(read(q("short", "s", { max: 5 }), "  hello  "), { value: "hello" });
  assert.deepEqual(read(q("short", "s", { max: 5 }), "hello!"), { error: "too_long" });
  assert.deepEqual(read(q("short", "s", { min: 3 }), "hi"), { error: "too_short" });
  assert.deepEqual(read(q("long", "l"), "line one\r\nline two"), { value: "line one\nline two" });
  assert.deepEqual(read(q("email", "e"), "a@b.co"), { value: "a@b.co" });
  assert.deepEqual(read(q("email", "e"), "not an email"), { error: "email" });
  assert.deepEqual(read(q("email", "e"), " Ana.B@Example.COM "), { value: "Ana.B@example.com" });
  assert.deepEqual(read(q("phone", "p"), "+33 6 12 34 56 78"), { value: "+33 6 12 34 56 78" });
  assert.deepEqual(read(q("phone", "p"), "call me"), { error: "phone" });
  assert.deepEqual(read(q("number", "n", { min: 1, max: 10 }), "3,5"), { value: 3.5 });
  assert.deepEqual(read(q("number", "n", { min: 1, max: 10 }), 11), { error: "too_large" });
  assert.deepEqual(read(q("number", "n"), "1e999"), { error: "invalid" });
  assert.deepEqual(read(q("yesno", "y"), "yes"), { error: "invalid" });
  assert.deepEqual(read(q("rating", "r", { steps: 5 }), 6), { error: "invalid" });
  assert.deepEqual(read(q("scale", "s", { from: 0, to: 10 }), 0), { value: 0 });
  assert.deepEqual(read(q("date", "d"), "2026-02-30"), { error: "date" });
  assert.deepEqual(read(q("date", "d"), "2026-02-28"), { value: "2026-02-28" });
  assert.deepEqual(read(q("statement", "s"), "anything"), {});
  assert.deepEqual(read(q("short", "s"), ""), {});
});

test("choices: known options only, one for a single choice, bounds for several, Other only when offered", () => {
  const options = opts("Red", "Green", "Blue");
  const [r, g, b] = options.map(o => o.id) as [string, string, string];
  const single = q("choice", "c", { options, other: true });
  assert.deepEqual(read(single, { ids: [g] }), { value: { ids: [g] } });
  assert.deepEqual(read(single, { ids: [g, b] }), { error: "invalid" });
  assert.deepEqual(read(single, { ids: ["zzzzzzzz"] }), { error: "invalid" });
  assert.deepEqual(read(single, { ids: [], other: " Purple " }), { value: { ids: [], other: "Purple" } });
  const many = q("choices", "m", { options, min: 2, max: 2 });
  assert.deepEqual(read(many, { ids: [b, r] }), { value: { ids: [r, b] } }, "kept in the options' order");
  assert.deepEqual(read(many, { ids: [r] }), { error: "too_few" });
  assert.deepEqual(read(many, { ids: [r, g, b] }), { error: "too_many" });
  assert.deepEqual(read(many, { ids: [r], other: "x" }), { error: "invalid" }, "no Other offered");
  assert.deepEqual(read(q("dropdown", "d", { options }), { ids: [r, r] }), { value: { ids: [r] } });
});

test("conditions compare as people expect", () => {
  const options = opts("A", "B");
  const [a, b] = options.map(o => o.id) as [string, string];
  assert.ok(matches({ question: "qqqqqqqq", op: "is", value: a }, { qqqqqqqq: { ids: [a] } }));
  assert.ok(matches({ question: "qqqqqqqq", op: "is_not", value: b }, { qqqqqqqq: { ids: [a] } }));
  assert.ok(matches({ question: "qqqqqqqq", op: "is", value: "other" }, { qqqqqqqq: { ids: [], other: "x" } }));
  assert.ok(matches({ question: "qqqqqqqq", op: "is", value: "élodie" }, { qqqqqqqq: "Elodie " }), "case and accents aside");
  assert.ok(matches({ question: "qqqqqqqq", op: "includes", value: "urgent" }, { qqqqqqqq: "Very URGENT please" }));
  assert.ok(matches({ question: "qqqqqqqq", op: "gt", value: 6 }, { qqqqqqqq: 7 }));
  assert.ok(!matches({ question: "qqqqqqqq", op: "lt", value: 6 }, {}), "unanswered never compares");
  assert.ok(matches({ question: "qqqqqqqq", op: "empty" }, { qqqqqqqq: "  " }));
});

test("prefill: by label or id, case aside; files never; anything invalid ignored", () => {
  const options = opts("Paris", "Lyon");
  const city = q("choice", "City", { options });
  const email = q("email", "Email");
  const agree = q("yesno", "Agree?");
  const stars = q("rating", "Stars", { steps: 5 });
  const cv = q("file", "CV");
  const def = form([city, email, agree, stars, cv]);
  assert.deepEqual(prefill(def, { [city.id]: "lyon", [email.id]: "a@b.co", [agree.id]: "oui", [stars.id]: "9", [cv.id]: "x" }), {
    [city.id]: { ids: [options[1]!.id] },
    [email.id]: "a@b.co",
    [agree.id]: true,
  });
});

test("an answer as text: labels, Yes/No, file names", () => {
  const options = opts("Red", "Green");
  const words = { yes: "Yes", no: "No", other: "Other" };
  assert.equal(answerText(q("choices", "c", { options }), { ids: [options[1]!.id], other: "Pink" }, words), "Green, Other: Pink");
  assert.equal(answerText(q("yesno", "y"), false, words), "No");
  assert.equal(answerText(q("file", "f"), { file: "answers/1/x.pdf", name: "cv.pdf", type: "application/pdf", size: 3 }, words), "cv.pdf");
  assert.equal(answerText(q("number", "n"), 4.5, words), "4.5");
});

test("an email question reads an address as the package's field.email() does", () => {
  const rule = field.email();
  const cases = [
    "a@b.co", " Ana.B@Example.COM ", "élodie@exemple.fr", "a+tag@sub.example.org", "x@münchen.de",
    "not an email", "a@b", "a b@example.com", "Ana <ana@example.com>", "<a@example.com>", "\"a\"@example.com",
    "a..b@example.com", ".a@example.com", "a.@example.com", "a@[192.0.2.1]", "a@192.0.2.1", "a@-x.com", "a@x-.com",
    "a@example.com\u202e", "a\u200b@example.com", "a@example.com\nBcc: x@y.z", "a@@example.com", "@example.com", "x".repeat(65) + "@example.com",
  ];
  for (const typed of cases) {
    let expected: string | null;
    try {
      expected = rule.read(typed);
    } catch {
      expected = null;
    }
    assert.deepEqual(read(q("email", "e"), typed), expected === null ? { error: "email" } : { value: expected }, JSON.stringify(typed));
  }
});
