// What 0.2.3 adds or fixes, reported when the eighteen tools re-vendored
// 0.2.2 (each test names the tool that hit it). What needs a browser — the
// DateField race, the camera input on a desk, filters on a coloured band —
// is also played by scripts/gallery/check-flows.mjs and check-page.mjs.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { contrast } from "../src/color.js";
import { checkTheme, colorTokens, optionalColorTokens, pairs, validateTheme } from "../src/contract.js";
import { defineTheme } from "../src/compose.js";
import { chipRadius, themeCss } from "../src/css.js";
import { deriveTheme } from "../src/derive.js";
import { inverseSignal } from "../src/signal.js";
import { catalogue, identityOf, themeOf } from "../src/themes.js";
import { Checkbox, DataTable, DateRangeField, FilePicker, Filters, storedFile, type Column } from "../src/components/index.js";
import { moveRangeStart } from "../src/components/dates.js";
import { clearValues, filterValues } from "../src/components/lists.js";
import { en, fr } from "../src/components/words.js";

const ui = join(import.meta.dirname, "..", "..");
const css = readFileSync(join(ui, "css", "components.css"), "utf8").replace(/\/\*[\s\S]*?\*\//gu, "");
const html = (el: ReactElement) => renderToStaticMarkup(el);
const noop = () => {};

// ---------- 1. DateField: the text follows the value in the render (Leave) ----------

test("DateField copies an outside change of its value into its text during the render, never in an effect (Leave's mixed texts)", () => {
  // The race itself is played in the browser (check-flows.mjs: a value
  // changed from outside, then the same field and the other end filled at
  // once; and the text read in the very commit that carries the value).
  // Here: the source keeps no effect that writes the text.
  const source = readFileSync(join(ui, "src", "components", "date-field.tsx"), "utf8");
  const field = source.slice(source.indexOf("export function DateField"), source.indexOf("export type CalendarProps"));
  assert.doesNotMatch(field, /useEffect\([^)]*setText/su, "no effect sets the text");
  assert.match(field, /if \(seen\.value !== value \|\| seen\.shown !== shown\) \{\s*setSeen\(\{ value, shown \}\);\s*setText\(shown\);/u, "the previous value kept in state, the text set during the render");
});

// ---------- 2. FilePicker: the camera's input hidden with its label (Expenses) ----------

test("FilePicker camera: its input is hidden together with its label off a touch screen (no tab stop, not read) — axe 'label' on a desk", () => {
  const cam = html(<FilePicker label="Receipts" files={[]} onChange={noop} camera accept={["image/*"]} labels={en.files} id="r" />);
  assert.match(cam, /<input id="r-camera" type="file" class="ck-vh ck-file-input ck-file-camera-input"/u);
  // display:none (not merely clipped) everywhere but under pointer: coarse.
  assert.match(css, /\.ck-file-camera, \.ck-file-camera-input, \.ck-file-choose \{ display: none; \}/u);
  assert.match(css, /@media \(pointer: coarse\) \{[^}]*\.ck-file-camera \{ display: inline-flex; \}\s*\.ck-file-camera-input \{ display: block; \}/u);
  // The focus ring still follows the input to its label on a phone.
  assert.match(css, /\.ck-file-input:focus-visible \+ \.ck-button/u);
});

// ---------- 3. The signal on a region of its own colour (Timesheets, Goals) ----------

test("--inverse-signal and --inverse-signal-ink: measured on the band in every catalogue theme and mode; Instrument's lime pinned on its panel", () => {
  assert.ok(colorTokens.includes("inverse-signal") && colorTokens.includes("inverse-signal-ink"));
  assert.ok(pairs.some(p => p.fg === "inverse-signal" && p.on.includes("inverse") && p.on.includes("inverse-line") && p.min === 4.5));
  assert.ok(pairs.some(p => p.fg === "inverse-signal-ink" && p.on.includes("inverse-signal") && p.min === 4.5));
  for (const t of catalogue) {
    assert.deepEqual(checkTheme(t), [], t.id);
    for (const mode of ["light", "dark"] as const) {
      const s = t[mode];
      assert.ok(contrast(s["inverse-signal"], s.inverse) >= 4.5, `${t.id} ${mode}: the signal reads on the band`);
      assert.ok(contrast(s["inverse-signal-ink"], s["inverse-signal"]) >= 4.5, `${t.id} ${mode}: text on the signal`);
    }
  }
  const instrument = identityOf("timesheets")!;
  assert.equal(instrument.light["inverse-signal"], "#c6ff3a", "the lime on the light panel");
  assert.equal(instrument.dark["inverse-signal"], "#c6ff3a", "and on the dark one: the dark look's --highlight is a dark ground");
  assert.equal(instrument.light.highlight, "#c6ff3a", "the marker pen is unchanged");
  assert.ok(contrast(instrument.dark.highlight, instrument.dark.inverse) < 3, "why: the dark marker pen vanishes on the panel");
  // Goals: the marker where it reads (light), its hue made light where it does not (dark).
  const trail = identityOf("goals")!;
  assert.equal(trail.light["inverse-signal"], trail.light.highlight);
  assert.ok(contrast(trail.dark["inverse-signal"], trail.dark.inverse) >= 4.5);
  assert.match(themeCss(instrument), /--inverse-signal:#c6ff3a;--inverse-signal-ink:#0d1f19/u);
});

test("the signal is derived for a tool's own identity and for any brand, and a hand-made theme of 0.2.2 without it stays valid", () => {
  const mine = defineTheme({ id: "mine", name: { en: "Mine", fr: "Le mien" }, description: { en: "Mine.", fr: "Le mien." }, fonts: { display: "inter", body: "inter" }, radius: { s: 4, m: 8, l: 12 },
    light: { bg: "#ffffff", surface: "#ffffff", ink: "#111111", "ink-2": "#555555", line: "#dddddd", accent: "#0055cc", "accent-ink": "#ffffff", highlight: "#ffe066" },
    dark: { bg: "#111111", surface: "#1b1b1b", ink: "#eeeeee", "ink-2": "#aaaaaa", line: "#333333", accent: "#88aaff", "accent-ink": "#111111" } });
  assert.deepEqual(checkTheme(mine), []);
  assert.equal(mine.light["inverse-signal"], "#ffe066", "the marker pen, where it reads on the band");
  assert.equal(mine.light["inverse-signal-ink"], mine.light.inverse);
  for (const primary of ["#e4572e", "#2b59c3", "#ffcc00", "#0a0a0a", "#f5f5f5"]) {
    const brand = deriveTheme({ primary, secondary: "#7a5cff" }).theme;
    assert.deepEqual(checkTheme(brand), [], primary);
  }
  // 0.2.2's theme, made by hand: no signal tokens.
  const t = identityOf("tasks")!;
  const strip = (s: typeof t.light) => Object.fromEntries(Object.entries(s).filter(([k]) => !(optionalColorTokens as readonly string[]).includes(k))) as typeof t.light;
  const old = { ...t, light: strip(t.light), dark: strip(t.dark) };
  assert.deepEqual(validateTheme(old), []);
  assert.deepEqual(checkTheme(old), []);
  const out = themeCss(old);
  assert.ok(out.includes(`--inverse-signal:${inverseSignal(t.light)}`), "its default is written");
  assert.ok(validateTheme({ ...old, light: { ...old.light, "inverse-signal": "lime" } }).length > 0, "a value given is still checked");
});

// ---------- 4. The rest ----------

test("an identity sets radius.chip in its own look without diverging from the catalogue (CRM's square badges)", () => {
  const desk = identityOf("crm")!;
  assert.equal(desk.radius.chip, 3);
  assert.match(themeCss(desk), /--radius-chip:3px/u);
  // CRM's copy of the source (no chip) equals the catalogue's.
  const source = { id: "sales-desk", tool: "crm", name: desk.name, description: desk.description, fonts: { display: "ibm-plex-sans", body: "ibm-plex-sans", mono: "ibm-plex-mono" }, radius: { s: 3, m: 6, l: 10 },
    light: { bg: "#f4f6f9", surface: "#ffffff", ink: "#0f1722", "ink-2": "#3b4656", line: "#d5dbe3", accent: "#2152ff", "accent-ink": "#ffffff" },
    dark: { bg: "#0b0f15", surface: "#121821", ink: "#e6ebf2", "ink-2": "#b3bdca", line: "#263140", accent: "#6f8cff", "accent-ink": "#0b0f15" } };
  assert.equal(defineTheme(source).radius.chip, 3);
  assert.equal(defineTheme({ ...source, radius: { s: 3, m: 6, l: 10, chip: 999 } }).radius.chip, 999, "what the source says wins");
  assert.equal(chipRadius(defineTheme({ ...source, tool: "other" })), 999, "another tool of that id: the default");
  assert.equal(chipRadius(themeOf("workshop")!), 999);
});

const quotes = [{ id: "F-2026-014", client: "Atelier Martin" }];
const cols: Column<{ id: string; client: string }>[] = [{ key: "id", label: "Number", value: r => r.id, rowHeader: true }, { key: "client", label: "Client", value: r => r.client }];

test("DataTable phone=stack: the row's header heads its card, it is not a labelled line (Quotes)", () => {
  const t = html(<DataTable caption="Invoices" columns={cols} rows={quotes} rowKey={r => r.id} phone="stack" labels={en.table} />);
  assert.match(t, /<th scope="row">F-2026-014<\/th>/u);
  assert.doesNotMatch(t, /<th[^>]*data-label="Number"/u);
  assert.match(t, /<td data-label="Client">Atelier Martin<\/td>/u);
});

test("member chip: name and role on one line each on a wide screen (Hiring)", () => {
  assert.match(css, /\.ck-member \{ flex: none; \}\s*\.ck-member-name, \.ck-member-role \{ white-space: nowrap; \}/u);
});

const categories = [
  { value: "laptop", label: "Laptops", group: "Hardware", count: 4 },
  { value: "screen", label: "Screens", group: "Hardware" },
  { value: "other", label: "Other" },
  { value: "licence", label: "Licences", group: "Software" },
];

test("Filters select: sections as optgroups, a per-group empty choice, and no Clear when its own All does the same (Equipment, Forms)", () => {
  const f = html(<Filters path="/chest/items" params="cat=screen" labels={en.filters} groups={[{ key: "cat", label: "Category", as: "select", allLabel: "Every category", options: categories }]} />);
  assert.match(f, /<option value="">Every category<\/option><option value="other">Other<\/option><optgroup label="Hardware"><option value="laptop">Laptops \(4\)<\/option><option value="screen" selected="">Screens<\/option><\/optgroup><optgroup label="Software"><option value="licence">Licences<\/option><\/optgroup>/u);
  assert.doesNotMatch(f, /ck-filter-clear/u, "one select on: its own All lets it go");
  const two = html(<Filters path="/chest/items" params="cat=screen&state=out" labels={en.filters} groups={[{ key: "cat", label: "Category", as: "select", options: categories }, { key: "state", label: "State", options: [{ value: "out", label: "Out" }] }]} />);
  assert.match(two, /class="ck-filter-clear">Clear filters</u, "two filters on: Clear");
  const chip = html(<Filters path="/chest/items" params="owner=mbr_a" labels={en.filters} groups={[{ key: "owner", label: "Owner", all: true, allLabel: "Anyone", options: [{ value: "mbr_a", label: "Léa" }] }]} />);
  assert.match(chip, />Anyone<\/a>/u);
  assert.match(chip, /ck-filter-clear/u, "a chip group keeps its Clear (as in 0.2.2)");
});

test("Filters in-page mode: value and onChange, buttons that toggle, the address untouched (Expenses, Forms)", () => {
  const f = html(<Filters value={{ state: "sent" }} onChange={noop} labels={fr.filters} groups={[{ key: "state", label: "État", all: true, multiple: true, options: [{ value: "sent", label: "Envoyé" }, { value: "late", label: "En retard" }] }, { key: "who", label: "Qui", as: "select", options: [{ value: "a", label: "Léa" }] }]} />);
  assert.match(f, /<div class="ck-filter-group" role="group" aria-label="État">/u);
  assert.match(f, /<button type="button" class="ck-filter-chip" aria-pressed="false">Tout<\/button>/u);
  assert.match(f, /<button type="button" class="ck-filter-chip" aria-pressed="true"><span>Envoyé<\/span><\/button>/u);
  assert.match(f, /<select id="[^"]+" class="ck-field ck-select"><option value="" selected="">Tout<\/option>/u);
  assert.doesNotMatch(f, /<a |<form /u, "no link, no form");
  assert.match(f, /<button type="button" class="ck-filter-clear">Retirer les filtres<\/button>/u);
  assert.deepEqual(filterValues({ state: "sent" }, "state", "late", { multiple: true }), { state: "sent,late" });
  assert.deepEqual(filterValues({ state: "sent", page: "3" }, "state", "sent"), {}, "a chip toggles off; the page resets");
  assert.deepEqual(clearValues({ state: "sent", q: "garage" }, ["state"]), { q: "garage" });
  assert.match(css, /\.ck-filter-chip:is\(\[aria-current="true"\], \[aria-pressed="true"\]\)/u);
});

test("Filters on a coloured band: its two colours are tokens a tool sets to the band's measured pair (Tasks)", () => {
  // Set on an ancestor (the band), so read with a fallback — never
  // declared on .ck-filters itself, which would win over the band's.
  assert.match(css, /\.ck-filter-label \{[^}]*color: var\(--ck-filters-ink, var\(--ink-2\)\)/u);
  assert.match(css, /\.ck-filter-clear \{[^}]*color: var\(--ck-filters-link, var\(--accent-text\)\)/u);
  assert.doesNotMatch(css, /--ck-filters-(ink|link):/u);
  // On --cat-N-soft, --cat-N-ink is measured (4.5:1) in every theme.
  for (const t of catalogue) for (const mode of ["light", "dark"] as const) for (let n = 1; n <= 8; n++) {
    assert.ok(contrast(t[mode][`cat-${n}-ink` as "cat-1-ink"], t[mode][`cat-${n}-soft` as "cat-1-soft"]) >= 4.5, `${t.id} ${mode} ${n}`);
  }
});

test("DateRangeField (Leave, Timesheets, Forms): keepLength, ids, a slot under each end, first-day chips, the tool's own count", () => {
  assert.deepEqual(moveRangeStart({ from: "2026-10-05", to: "2026-10-20" }, "2026-10-12", { keepLength: false }), { from: "2026-10-12", to: "2026-10-20" }, "a filter's end stays");
  assert.deepEqual(moveRangeStart({ from: "2026-10-05", to: "2026-10-07" }, "2026-10-12", { keepLength: false }), { from: "2026-10-12", to: "2026-10-12" }, "never before the start");
  assert.deepEqual(moveRangeStart({ from: "2026-10-05", to: "2026-10-07" }, "2026-10-12"), { from: "2026-10-12", to: "2026-10-14" }, "by default, as 0.2.2");
  const field = html(<DateRangeField label="Leave" value={{ from: "2026-10-05", to: "2026-10-07" }} onChange={noop} today="2026-09-29" labels={en.date}
    ids={{ from: "start", to: "end" }} chips below={{ from: <p className="half">Whole day</p>, to: <p className="half">Morning only</p> }} length="2.5 working days" />);
  assert.match(field, /<div class="ck-range-end"><div class="ck-date"><label [^>]*for="start">From<\/label>.*<p class="half">Whole day<\/p><\/div><div class="ck-range-end"><div class="ck-date"><label [^>]*for="end">To<\/label>.*<p class="half">Morning only<\/p><\/div>/u);
  assert.match(field, /<input id="start" /u);
  assert.match(field, /<input id="end" /u);
  assert.equal((field.match(/ck-chip-button/gu) ?? []).length, 2, "Today and Tomorrow on the first day only");
  assert.match(field, /<p class="ck-hint ck-range-length" aria-live="polite">2.5 working days<\/p>/u);
  const plain = html(<DateRangeField label="Trip" value={{ from: null, to: null }} onChange={noop} today="2026-09-29" labels={en.date} />);
  assert.doesNotMatch(plain, /ck-range-end|ck-chip-button/u, "without the new props: 0.2.2's markup");
  assert.match(css, /\.ck-range-row > \.ck-date, \.ck-range-row > \.ck-range-end \{ flex: 1 1 13em;/u);
});

test("FilePicker: a larger preview, and a file stored before (Expenses)", () => {
  const stored = storedFile({ ref: "obj_42", name: "receipt-march.jpg", size: 48_000, type: "image/jpeg" });
  assert.deepEqual({ status: stored.status, ref: stored.ref, file: stored.file, stored: stored.stored, key: stored.key }, { status: "ready", ref: "obj_42", file: null, stored: true, key: "stored-obj_42" });
  const f = html(<FilePicker label="Receipts" files={[stored, storedFile({ ref: "obj_7", name: "old.pdf" })]} onChange={noop} name="receipts" labels={fr.files} previewSize="l" preview={p => <img src={`/f/${p.ref}`} alt="" />} />);
  assert.match(f, /<li class="ck-file ck-file-ready ck-file-stored ck-file-with-preview ck-file-preview-l">/u);
  assert.match(f, /<span class="ck-file-meta">47.Ko · Enregistré<\/span>/u);
  assert.match(f, /<span class="ck-file-meta">Enregistré<\/span>/u, "no size known: the word alone");
  assert.match(f, /<input type="hidden" name="receipts" value="obj_42"\/><input type="hidden" name="receipts" value="obj_7"\/>/u, "the form keeps them");
  assert.doesNotMatch(f, /Réessayer/u, "a stored file is never sent again");
  assert.match(css, /\.ck-file-preview-l \.ck-file-preview \{ width: 96px; height: 96px; \}/u);
  const { stored: _s, ...old } = en.files;
  assert.match(html(<FilePicker label="R" files={[storedFile({ ref: "x", name: "a.pdf" })]} onChange={noop} labels={old} />), /Saved/u, "a 0.2.2 catalogue gets the kit's English");
});

test("Checkbox: the on/off of a form saved on submit (Forms, Timesheets) — native, its words the target, no script needed", () => {
  const c = html(<Checkbox label="Billable" name="billable" defaultChecked hint="Shown on the invoice." />);
  assert.match(c, /^<div class="ck-check"><input id="([^"]+-check)" type="checkbox" class="ck-check-input" [^>]*\/><label for="\1" class="ck-check-label">Billable<\/label><p id="[^"]+-hint" class="ck-hint">Shown on the invoice.<\/p><\/div>$/u);
  for (const attr of ['name="billable"', 'value="on"', 'checked=""', 'aria-describedby="']) assert.ok(c.includes(attr), attr);
  assert.doesNotMatch(c, /role="switch"/u);
  assert.match(css, /\.ck-check-label \{[^}]*min-height: var\(--control-h\)/u);
});
