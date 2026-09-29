// What 0.2.4 fixes, reported when the tools re-vendored 0.2.3 (each test
// names the tool that hit it). What needs a browser is also played there:
// the refused date and its form's stopped submit (scripts/gallery/check-flows.mjs), the phone's section
// names, the counts beside their icons and a stacked table's long labels
// (scripts/gallery/check-page.mjs).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DataTable, DateField, FilePicker, type Column, type DateFieldProps } from "../src/components/index.js";
import { readTypedDate } from "../src/components/dates.js";
import { acceptText } from "../src/components/files.js";
import { en, fr } from "../src/components/words.js";
import * as logic from "../src/components/logic.js";

const ui = join(import.meta.dirname, "..", "..");
const css = readFileSync(join(ui, "css", "components.css"), "utf8").replace(/\/\*[\s\S]*?\*\//gu, "");
const html = (el: ReactElement) => renderToStaticMarkup(el);
const noop = () => {};
const nnbsp = " ";
const phone = css.slice(css.indexOf("@media (max-width: 760px)"));

// ---------- 1. DateField: a day before min, or after max, is refused out loud (Timesheets) ----------

test("readTypedDate: a date before min or after max is refused with a sentence in the field's language, never read as a date", () => {
  const today = "2026-09-29";
  assert.deepEqual(readTypedDate("", en.date, today, { min: today }), { ok: true, value: null });
  assert.deepEqual(readTypedDate("  ", en.date, today), { ok: true, value: null });
  assert.deepEqual(readTypedDate("30/09/2026", en.date, today, { min: today, max: "2026-12-31" }), { ok: true, value: "2026-09-30" });
  assert.deepEqual(readTypedDate("29/09/2026", en.date, today, { min: today, max: today }), { ok: true, value: today }, "the ends are allowed");

  const early = readTypedDate("01/09/2026", en.date, today, { min: today });
  assert.equal(early.ok, false);
  assert.ok(!early.ok && early.reason === "too_early");
  assert.ok(!early.ok && /^Choose .*29.* September 2026 or later\.$/u.test(early.problem), !early.ok ? early.problem : "");

  const late = readTypedDate("demain", fr.date, today, { max: today });
  assert.ok(!late.ok && late.reason === "too_late");
  assert.ok(!late.ok && /^Choisissez le .*29 septembre 2026 ou avant\.$/u.test(late.problem), !late.ok ? late.problem : "");

  const unreadable = readTypedDate("31/02/2026", fr.date, today);
  assert.ok(!unreadable.ok && unreadable.reason === "invalid");
  assert.ok(!unreadable.ok && unreadable.problem.startsWith("Tapez une date comme "));
  assert.equal(logic.readTypedDate, readTypedDate, "server-safe, in /components/logic");
});

test("DateField: a refused text stays as typed, is said and marked invalid, onChange is not called, and a form's submit stops on it (Timesheets saved 'today')", () => {
  const source = readFileSync(join(ui, "src", "components", "date-field.tsx"), "utf8");
  const field = source.slice(source.indexOf("export function DateField"), source.indexOf("export type CalendarProps"));
  const commit = field.slice(field.indexOf("function commit("), field.indexOf("function pick("));
  assert.match(commit, /readTypedDate\(raw, labels, today, \{ min, max \}\)/u, "min and max are checked where the text is read");
  // Refused: the problem is said; neither the old date nor a null (which
  // an auto-saving tool — Tasks' due dates — would store) is sent.
  const refused = commit.slice(commit.indexOf("if (!read.ok)"), commit.indexOf("return undefined"));
  assert.match(refused, /setProblem\(read\.problem\);/u);
  assert.doesNotMatch(refused, /onChange|setText/u, "no onChange, the typed text kept");
  // The browser knows (a form's submit stops on the field), the tool is
  // told, and the form's hidden value is empty while the problem stands.
  assert.match(field, /setCustomValidity\(problem \?\? ""\)/u);
  assert.match(field, /onProblem\?\.\(problem\)/u);
  assert.match(field, /<input type="hidden" name=\{name\} value=\{problem \? "" : value \?\? ""\} \/>/u);
  // The words, in both languages, name the limit.
  assert.equal(en.date.tooEarly, "Choose {date} or later.");
  assert.equal(fr.date.tooEarly, "Choisissez le {date} ou après.");
  assert.equal(en.date.tooLate, "Choose {date} or earlier.");
  assert.equal(fr.date.tooLate, "Choisissez le {date} ou avant.");
});

test("DateField: an error is read with the field (aria-invalid, aria-describedby) and onProblem is an optional prop", () => {
  const props: DateFieldProps = { label: "From", value: null, onChange: noop, today: "2026-09-29", min: "2026-09-29", id: "from", error: "Choose 29 September 2026 or later.", labels: en.date, onProblem: noop };
  const out = html(<DateField {...props} />);
  assert.match(out, /aria-invalid="true"/u);
  const described = /aria-describedby="([^"]+)"/u.exec(out)![1]!.split(" ");
  const errorId = /<p id="([^"]+)" class="ck-error">Choose 29 September 2026 or later\.<\/p>/u.exec(out)![1]!;
  assert.ok(described.includes(errorId));
  assert.match(out, /class="ck-date ck-invalid"/u);
  // 0.2.3's props still fit (no onProblem).
  assert.doesNotMatch(html(<DateField label="From" value="2026-10-01" onChange={noop} today="2026-09-29" labels={en.date} />), /aria-invalid/u);
});

// ---------- 2. Phone navigation: whole names, counts beside their icons (Expenses) ----------

test("phone navigation: a tab takes what its longest word needs, the face a little smaller, before any '…' (Expenses: 'À rembour…')", () => {
  assert.match(phone, /\.ck-nav ul \{[^}]*grid-auto-columns: minmax\(min-content, 1fr\);/u, "equal tabs while every word fits; a long word widens its tab");
  assert.match(phone, /\.ck-nav-link \{[^}]*max-width: 40vw;/u, "one word never takes more than 40% of the row");
  assert.match(phone, /\.ck-nav-link \{[^}]*padding: var\(--space-1\) 2px;/u);
  assert.match(phone, /\.ck-nav-link \{[^}]*font-size: min\(var\(--text-xs\), 0\.75rem\);/u, "at most 12 px on a phone");
  assert.match(phone, /\.ck-nav-link \{[^}]*white-space: normal;/u, "two lines at a space");
  assert.match(phone, /\.ck-nav-label \{[^}]*overflow-wrap: normal;[^}]*\}/u, "never inside a word");
  assert.doesNotMatch(css, /overflow-wrap: anywhere|hyphens: auto/u);
});

test("phone navigation: a count sits beside its icon, never over it (Expenses)", () => {
  // The icon is 20 px wide, centred: its right edge is at 50% + 10px.
  const m = /\.ck-nav-link \.ck-count \{[^}]*left: calc\(50% \+ (\d+)px\);/u.exec(phone);
  assert.ok(m && Number(m[1]) >= 12, "the count starts 2 px right of the icon");
  assert.match(css, /\.ck-nav-icon svg \{ width: 20px; height: 20px; \}/u);
});

// ---------- 3. FilePicker: nothing to drop on a touch screen; kinds by their usual names ----------

test("FilePicker: 'Or drop it here' is not said on a touch screen (Forms had its own rule)", () => {
  assert.match(css, /@media \(pointer: coarse\) \{[^@]*\.ck-drop-hint \{ display: none; \}/u);
  assert.match(css, /@media \(hover: none\) \{ \.ck-drop-hint \{ display: none; \} \}/u);
  const one = html(<FilePicker label="Photo" files={[]} onChange={noop} maxFiles={1} labels={fr.files} />);
  assert.match(one, /<span class="ck-drop-hint" aria-hidden="true">/u, "said on a desk, hidden by the stylesheet only");
});

test("acceptText: each kind once by the name people know (JPG, VCF, OpenDocument), families in the reader's language (Support, CRM, People, Expenses)", () => {
  assert.equal(acceptText(["image/jpeg", "image/png", ".jpeg", ".jpg"], en.files), "JPG, PNG");
  assert.equal(acceptText(["text/vcard", "text/x-vcard", ".vcf", ".vcard", "text/directory"], en.files), "VCF");
  assert.equal(acceptText(["application/vnd.oasis.opendocument.text", "application/vnd.oasis.opendocument.spreadsheet", "application/vnd.oasis.opendocument.presentation", "application/vnd.oasis.opendocument.graphics", ".odt"], en.files), "ODT, ODS, ODP, ODG");
  assert.equal(acceptText(["image/*", ".pdf", ".png"], fr.files), "images, PDF");
  assert.equal(acceptText(["audio/*", "video/*"], fr.files), "fichiers audio, vidéos");
  // 0.2.4: no "GRAPHICS", "12" or "+zip" as a kind's name.
  assert.equal(acceptText(["application/epub+zip", "image/x-icon", "application/gzip", "application/vnd.ms-excel.sheet.macroEnabled.12"], en.files), "EPUB, ICO, GZ, XLSM");
  assert.equal(acceptText(["application/vnd.example.report+json", "application/x-7z-compressed"], en.files), "REPORT, 7Z");
});

// ---------- 4. DataTable phone="stack": long labels wrap beside their value (Forms) ----------

type Answer = { id: string; who: string; heard: string };
const answers: Answer[] = [{ id: "A-1", who: "Léa Moreau", heard: "A friend" }];
const cols: Column<Answer>[] = [
  { key: "who", label: "Name", value: r => r.who, rowHeader: true },
  { key: "heard", label: "How did you hear about the spring open day at the workshop?", value: r => r.heard },
];

test("DataTable phone=stack: a line's label wraps beside its value (at most 60%), and the row's header carries no label (Forms, Quotes)", () => {
  assert.match(css, /\.ck-table-stack \[data-label\]::before \{[^}]*flex: 0 1 auto; min-width: 0; max-width: 60%;[^}]*\}/u);
  assert.doesNotMatch(css, /\.ck-table-stack \[data-label\]::before \{[^}]*flex: none/u, "no longer kept at its full width");
  const t = html(<DataTable caption="Answers" columns={cols} rows={answers} rowKey={r => r.id} phone="stack" labels={en.table} />);
  assert.match(t, /<th scope="row">Léa Moreau<\/th>/u);
  assert.match(t, /<td data-label="How did you hear about the spring open day at the workshop\?">A friend<\/td>/u);
});

// ---------- 5. The package ----------

test("the kit says its version: 0.2.4-studio.1", () => {
  const pkg = JSON.parse(readFileSync(join(ui, "package.json"), "utf8")) as { version: string };
  assert.equal(pkg.version, "0.2.4-studio.1");
  assert.ok(!fr.date.tooEarly.includes(" :") && !fr.files.separator?.startsWith(" "), "French words keep their narrow spaces");
  assert.equal(fr.files.separator, `${nnbsp}: `);
});
