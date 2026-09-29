// What 0.2.2 adds or fixes, reported by the sixteen tools that migrated to
// the kit (each test names the tool that hit it). What needs a browser —
// nested dialogs, the toast's line, the 44 px targets, the phone header —
// is also played by scripts/gallery/check-flows.mjs and check-page.mjs.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { forwardRef, type AnchorHTMLAttributes, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { contrast } from "../src/color.js";
import { checkTheme, colorTokens, pairs, staticTokens, validateTheme } from "../src/contract.js";
import { defineTheme, identityAdditions } from "../src/compose.js";
import { themeCss } from "../src/css.js";
import { deriveTheme } from "../src/derive.js";
import { fontFaces } from "../src/fonts.js";
import { catalogue, catalogueFonts, identityOf, themeOf } from "../src/themes.js";
import {
  AppShell, Calendar, DataTable, DateField, DateRangeField, FilePicker, Filters, LanguageSwitch, Menu, Nav, PageHeader, PeoplePicker, SearchBox, Segmented,
  StatusBadge, Switch, Tabs, useFloat, type Column, type PickedFile,
} from "../src/components/index.js";
import { acceptText } from "../src/components/files.js";
import { moveRangeEnd, moveRangeStart, rangeDays } from "../src/components/dates.js";
import { expired, toastReducer, type ToastState } from "../src/components/toast-state.js";
import { en, fr, storeLanguages } from "../src/components/words.js";

const ui = join(import.meta.dirname, "..", "..");
const css = readFileSync(join(ui, "css", "components.css"), "utf8").replace(/\/\*[\s\S]*?\*\//gu, "");
const html = (el: ReactElement) => renderToStaticMarkup(el);
const noop = () => {};
const nnbsp = " ";
const Link = forwardRef<HTMLAnchorElement, AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children?: ReactNode }>(function Link(props, ref) {
  return <a ref={ref} data-next="" {...props} />;
});

// ---------- 1. nested dialogs (Expenses) ----------

test("Dialog and Confirm answer only their own cancel and close events (a nested Confirm no longer closes its Dialog)", () => {
  // The events are the browser's (played in check-flows.mjs: a Confirm
  // opened from a Dialog, cancelled by its button and by Escape, leaves the
  // Dialog open). Here, the rule in the source: each handler checks that
  // the event is its own dialog's.
  const source = readFileSync(join(ui, "src", "components", "dialog.tsx"), "utf8");
  const handlers = [...source.matchAll(/on(Cancel|Close)=\{e => \{([^\n]+)\}\}/gu)].map(m => m[2]!);
  assert.equal(handlers.length, 4, "Dialog and Confirm: onCancel and onClose each");
  for (const h of handlers) assert.match(h, /e\.target (!==|===) e\.currentTarget/u, h);
});

// ---------- 2. the toast's line (Wiki) ----------

test("a toast keeps its close button on the text's line: no wrapping, the text shrinks first", () => {
  const toast = /\.ck-toast \{([^}]+)\}/u.exec(css)![1]!;
  assert.doesNotMatch(toast, /flex-wrap/u);
  assert.match(css, /\.ck-toast-text \{ flex: 1 1 auto; min-width: 0;/u, "no 12em basis that pushed the buttons down");
  assert.match(css, /\.ck-toast-undo, \.ck-toast-action, \.ck-toast-close \{ flex: none;/u);
});

// ---------- 3. targets (Wiki, Support) ----------

test("every control of the kit is a 44 px target (--control-h): small buttons, links, sort headers, chips' remove, segments", () => {
  for (const cls of ["ck-button-small", "ck-button-link", "ck-sort"]) {
    const rule = new RegExp(`\\.${cls} \\{([^}]+)\\}`, "u").exec(css)![1]!;
    assert.match(rule, /min-height: var\(--control-h\)/u, cls);
  }
  // No min-height or height in px below 44 on anything a person presses.
  const small = [...css.matchAll(/([^{}]+)\{([^}]*)\}/gu)].filter(([, sel, body]) => /button|link|chip-button|filter-chip|menu-item|ck-tab\b|ck-nav-link|ck-language|ck-day\b|ck-sort/u.test(sel!) && /(min-)?height: (\d+)px/u.test(body!) && Number(/(?:min-)?height: (\d+)px/u.exec(body!)![1]) < 44).map(([, sel]) => sel!.trim());
  assert.deepEqual(small.filter(s => !/ck-chip-remove|ck-switch|\.ck-icon$/u.test(s)), [], "controls under 44 px");
  // The chip's remove button (32 px, inside a 32 px chip) and the segments
  // (36 px inside the group's padding) reach 44 px with an invisible margin.
  assert.match(css, /\.ck-chip-remove::before \{ content: ""; position: absolute; inset: -6px; \}/u);
  assert.match(css, /\.ck-segment::before \{ content: ""; position: absolute; inset: -4px 0; \}/u);
  assert.match(css, /\.ck-day \{[^}]*min-height: var\(--control-h\)/u);
});

test("Menu: a shown label keeps the small words (size s) or a full button (size m), both 44 px", () => {
  assert.match(html(<Menu label="Export" showLabel items={[{ label: "CSV" }]} />), /class="ck-button ck-button-quiet ck-button-small"/u);
  assert.match(html(<Menu label="Export" showLabel size="m" items={[{ label: "CSV" }]} />), /class="ck-button ck-button-quiet"/u);
  assert.match(html(<Menu label="Export" className="row-menu" items={[{ label: "CSV" }]} />), /<div class="ck-menu row-menu">/u);
});

// ---------- 4. components ----------

const people = [{ id: "mbr_lea", name: "Léa Moreau" }, { id: "mbr_tom", name: "Tom Petit" }];

test("PeoplePicker clearable (People, Support): a visible button empties a single choice", () => {
  const one = html(<PeoplePicker label="Owner" search={async () => people} value={[people[0]!]} onChange={noop} clearable labels={fr.peoplePicker} className="owner" />);
  assert.match(one, /<div class="ck-picker owner">/u);
  assert.match(one, /<button type="button" class="ck-icon-button ck-picker-clear">.*<span class="ck-vh">Retirer Léa Moreau<\/span><\/button>/u);
  assert.doesNotMatch(html(<PeoplePicker label="Owner" search={async () => people} value={[]} onChange={noop} clearable />), /ck-picker-clear/u, "nothing chosen: nothing to clear");
  assert.doesNotMatch(html(<PeoplePicker label="Owner" search={async () => people} value={[people[0]!]} onChange={noop} />), /ck-picker-clear/u, "not clearable by default");
  assert.doesNotMatch(html(<PeoplePicker label="Guests" multiple search={async () => people} value={people} onChange={noop} clearable />), /ck-picker-clear/u, "several: the chips' own buttons");
});

test("Filters (Support, Equipment): clearAlso, a select group for many options, one scrolling line per group on a phone", () => {
  const groups = [{ key: "state", label: "State", all: true, options: [{ value: "open", label: "Open", count: 3 }] }];
  const withQ = html(<Filters path="/chest" params="q=printer&from=2026-09-01" clearAlso={["from"]} groups={groups} labels={en.filters} />);
  assert.match(withQ, /href="\/chest\?q=printer" class="ck-filter-clear">Clear filters/u, "a date range goes with the filters; the search stays");
  assert.doesNotMatch(html(<Filters path="/chest" params="q=printer" groups={groups} labels={en.filters} />), /ck-filter-clear/u);
  const many = Array.from({ length: 30 }, (_, i) => ({ value: `c${i}`, label: `Category ${i}`, count: i }));
  const select = html(<Filters path="/chest/items" params="state=open&cat=c4&page=3" labels={fr.filters} groups={[{ key: "cat", label: "Catégorie", as: "select", options: many }]} phone="scroll" className="toolbar" />);
  assert.match(select, /<div class="ck-filters ck-filters-scroll toolbar"/u);
  assert.match(select, /<form class="ck-filter-group ck-filter-select" action="\/chest\/items" method="get">/u);
  assert.match(select, /<input type="hidden" name="state" value="open"\/>/u, "the other filters stay");
  assert.doesNotMatch(select, /name="page"/u, "a new choice starts at the first page");
  assert.match(select, /<label class="ck-filter-label" for="([^"]+)">Catégorie<\/label><select id="\1" class="ck-field ck-select" name="cat">/u);
  assert.match(select, /<option value="">Tout<\/option>/u);
  assert.match(select, /<option value="c4" selected="">Category 4 \(4\)<\/option>/u);
  assert.match(select, /<noscript>/u, "without script, a button sends it");
  assert.match(css, /\.ck-filters-scroll \.ck-filter-group ul \{ flex: 1 1 0; width: 0; flex-wrap: nowrap; min-width: 0; overflow-x: auto;/u);
});

test("SearchBox (Forms): minLength, required, several values kept for one parameter", () => {
  const box = html(<SearchBox action="/chest" labels={en.search} minLength={2} required keep={{ tag: ["a", "b"], state: "open", none: undefined }} className="top" />);
  assert.match(box, /<form class="ck-search top"/u);
  assert.match(box, /<input type="hidden" name="tag" value="a"\/><input type="hidden" name="tag" value="b"\/><input type="hidden" name="state" value="open"\/>/u);
  assert.match(box, /minLength="2"/u);
  assert.match(box, /required=""/u);
});

test("acceptText (Expenses, CRM, Support, People): families in words, one name per type, MIME types as extensions", () => {
  assert.equal(acceptText(["image/*", ".pdf"]), "images, PDF");
  assert.equal(acceptText(["image/*", ".pdf"], fr.files), "images, PDF");
  assert.equal(acceptText([".jpg", ".jpeg", "image/jpeg", ".png"]), "JPG, PNG", "JPG and JPEG are one");
  assert.equal(acceptText(["text/vcard", "text/x-vcard", "text/directory", ".vcf", ".vcard"]), "VCF", "vCard's spellings are one");
  assert.equal(acceptText([".odt", "application/vnd.oasis.opendocument.text", "application/vnd.oasis.opendocument.spreadsheet", ".ods", "application/vnd.oasis.opendocument.presentation"]), "ODT, ODS, ODP");
  assert.equal(acceptText(["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/msword", "application/x-7z-compressed"]), "DOCX, DOC, 7Z");
  assert.equal(acceptText(["video/*", "audio/*"], fr.files), "vidéos, fichiers audio");
  assert.equal(acceptText(["image/*", ".png", ".heic", ".pdf"]), "images, PDF", "what images already says is not repeated");
  assert.equal(acceptText([".csv", "text/csv", ".xlsx"]), "CSV, XLSX");
});

const picked: PickedFile[] = [{ key: "f1", name: "ticket.jpg", size: 1200, type: "image/jpeg", file: null, status: "ready", progress: 1, ref: "obj_1", error: null }];

test("FilePicker (Expenses, Equipment, Forms): camera, a preview slot, a shown label, its id, the words' separator", () => {
  const cam = html(<FilePicker label="Justificatifs" files={picked} onChange={noop} camera accept={["image/*", ".pdf"]} labels={fr.files} id="receipts" showLabel className="receipts"
    preview={f => <img src={`/chest/files/${f.ref}`} alt="" />} />);
  assert.match(cam, /<div class="ck-files receipts" role="group" aria-labelledby="receipts-label"><span id="receipts-label" class="ck-label">Justificatifs<\/span>/u);
  assert.match(cam, /<input id="receipts-camera" type="file" class="ck-vh ck-file-input ck-file-camera-input" accept="image\/\*" capture="environment"/u);
  assert.match(cam, /<label for="receipts-camera" class="ck-button ck-button-quiet ck-file-camera">.*<span>Prendre une photo<\/span><span class="ck-vh">.: Justificatifs<\/span><\/label>/u);
  assert.match(cam, /<input id="receipts" type="file" class="ck-vh ck-file-input" multiple="" accept="image\/\*,.pdf"/u);
  assert.doesNotMatch(cam, /<input id="receipts" [^>]*capture/u, "the file button opens the files, not the camera");
  assert.match(cam, /<span class="ck-file-choose">Choisir un fichier<\/span><span class="ck-file-add">Ajouter des fichiers<\/span>/u);
  assert.ok(cam.includes(`<span class="ck-vh">${nnbsp}: Justificatifs</span>`), "French: a narrow no-break space before the colon");
  assert.ok(cam.includes(`aria-label="Justificatifs${nnbsp}: Fichiers"`));
  assert.match(cam, /<li class="ck-file ck-file-ready ck-file-with-preview"><span class="ck-file-preview"><img src="\/chest\/files\/obj_1" alt=""\/><\/span>/u);
  assert.match(cam, /Acceptés.: images, PDF\./u);
  const plain = html(<FilePicker label="Receipts" files={[]} onChange={noop} capture="environment" labels={en.files} />);
  assert.match(plain, /capture="environment"/u, "capture alone still opens the camera");
  assert.match(plain, /<span class="ck-vh">: Receipts<\/span>/u);
  assert.doesNotMatch(plain, /ck-file-camera|role="group"/u);
  assert.match(css, /@media \(pointer: coarse\) \{\s*\.ck-file-camera \{ display: inline-flex; \}/u, "Take a photo only on a touch screen");
  // A catalogue of 0.2.1 (no separator, no camera words) still works: the kit's English fills in.
  const { takePhoto: _t, chooseFile: _c, kinds: _k, separator: _s, ...old } = en.files;
  assert.match(html(<FilePicker label="R" files={[]} onChange={noop} camera labels={old} accept={["image/*"]} />), /Take a photo.*: R.*Accepted: images\./u);
});

test("className (Expenses, CRM, Wiki, Forms): StatusBadge, DateField, DataTable (and its id), NavItem, Segmented, Tabs", () => {
  assert.match(html(<StatusBadge tone="ok" label="Paid" className="stamp" />), /class="ck-badge ck-badge-m ck-tone-ok stamp"/u);
  assert.match(html(<DateField label="Day" value={null} onChange={noop} today="2026-09-29" className="due" />), /<div class="ck-date due"/u);
  const cols: Column<{ id: string }>[] = [{ key: "id", label: "Id", value: r => r.id, rowHeader: true }];
  assert.match(html(<DataTable caption="Deals" rows={[{ id: "d1" }]} rowKey={r => r.id} columns={cols} className="deals" id="deals-table" />), /<div class="ck-table-wrap deals"[^>]*><table class="ck-table" id="deals-table">/u);
  assert.match(html(<Nav label="Main" path="/chest" items={[{ href: "/chest", label: "Home", className: "home" }]} />), /class="ck-nav-link home"/u);
  assert.match(html(<Segmented label="View" value="a" onChange={noop} className="views" options={[{ value: "a", label: "A" }, { value: "b", label: "B" }]} />), /<fieldset class="ck-segmented views">/u);
  assert.match(html(<Tabs label="T" current="a" className="tabs" items={[{ id: "a", label: "A", href: "?a" }]} />), /<nav class="ck-tabs tabs"/u);
});

test("DateField (People, Forms, Quotes): a label with more than words, the tool's descriptions, hideLabel, compact, data-*, onEnter", () => {
  const field = html(<DateField label={<>Start <abbr title="required">*</abbr></>} value="2026-09-30" onChange={noop} today="2026-09-29" describedBy="rule-1" labels={en.date} data-row="7" />);
  assert.match(field, /<div class="ck-date" data-row="7">/u);
  assert.match(field, /<label id="[^"]+" class="ck-label" for="[^"]+">Start <abbr title="required">\*<\/abbr><\/label>/u);
  assert.match(field, /aria-describedby="[^"]+-read rule-1"/u, "the kit's line first, then the tool's");
  const cell = html(<DateField label="Due" hideLabel variant="compact" value="2026-09-30" onChange={noop} today="2026-09-29" labels={en.date} />);
  assert.match(cell, /<div class="ck-date ck-date-compact">/u);
  assert.match(cell, /<label id="[^"]+" class="ck-vh"/u);
  assert.doesNotMatch(cell, /ck-chip-button/u, "no chips in a cell");
  assert.match(cell, /<p id="[^"]+-read" class="ck-vh">Tomorrow · Wednesday 30 September 2026<\/p>/u, "the date in words is still read");
  // The calendar is named by the label element, which may hold more than words.
  const source = readFileSync(join(ui, "src", "components", "date-field.tsx"), "utf8");
  assert.match(source, /labelledBy=\{labelId\}/u);
  assert.match(source, /if \(got !== undefined\) onEnter\?\.\(got\);/u);
});

test("Calendar multiple (People): several days chosen, the grid says so, it stays open, and can sit in the page", () => {
  const cal = html(<Calendar value={null} today="2026-09-29" multiple selected={["2026-10-02", "2026-10-05"]} onPick={noop} inline label="Days off" labels={en.date} />);
  assert.match(cal, /<div class="ck-calendar ck-calendar-inline" role="group" aria-label="Days off">/u);
  assert.match(cal, /aria-multiselectable="true"/u);
  assert.equal([...cal.matchAll(/aria-selected="true"/gu)].length, 2);
  assert.equal([...cal.matchAll(/ck-day-chosen/gu)].length, 2);
  assert.match(cal, /October 2026/u, "opens on the first chosen month");
  assert.doesNotMatch(cal, /Close the calendar/u, "inline, without onClose: no close button");
});

test("toast onExpire (People): due once when a toast goes while its act stands, never after an Undo that worked", () => {
  const calls: string[] = [];
  const show = (s: ToastState[], id: string, seq: number) => toastReducer(s, { type: "show", input: { id, text: id, undo: () => true, onExpire: () => calls.push(`${id}#${seq}`) }, now: 0, seq });
  let s = show([], "a", 1);
  s = show(s, "b", 2);
  let before = s;
  s = toastReducer(s, { type: "expire", id: "a", now: 20_000 });
  for (const t of expired(before, s)) t.onExpire?.();
  assert.deepEqual(calls, ["a#1"], "time up");
  before = s; s = show(s, "b", 3);
  for (const t of expired(before, s)) t.onExpire?.();
  assert.deepEqual(calls, ["a#1", "b#2"], "replaced by a toast of the same id");
  before = s; s = toastReducer(s, { type: "dismiss", id: "b" });
  for (const t of expired(before, s)) t.onExpire?.();
  assert.deepEqual(calls, ["a#1", "b#2", "b#3"], "dismissed");
  s = show(s, "c", 4);
  s = toastReducer(s, { type: "undoStart", id: "c" });
  s = toastReducer(s, { type: "undoEnd", id: "c", ok: true, note: null, now: 10 });
  before = s; s = toastReducer(s, { type: "expire", id: "c", now: 60_000 });
  assert.deepEqual(expired(before, s), [], "undone: its act no longer stands");
  s = show(s, "d", 5);
  s = toastReducer(s, { type: "undoStart", id: "d" });
  s = toastReducer(s, { type: "undoEnd", id: "d", ok: false, note: null, now: 10 });
  before = s; s = toastReducer(s, { type: "expire", id: "d", now: 60_000 });
  assert.equal(expired(before, s).length, 1, "an Undo that failed: the act stands");
  assert.equal(typeof useFloat, "function", "useFloat is exported (CRM)");
});

test("AppShell (Support, Wiki, Quotes): width full reaches the header's edges, tools per breakpoint, the phone's member text stays in place", () => {
  const full = html(<AppShell brand="Support" width="full" tools={<span>Bell</span>} toolsOn="wide" member={{ name: "Camille Martin", role: "Agent" }}><p>x</p></AppShell>);
  assert.match(full, /<div class="ck-shell ck-shell-full">/u);
  assert.match(full, /<div class="ck-bar-tools ck-wide-only"><span>Bell<\/span><\/div>/u);
  assert.match(html(<AppShell brand="S" tools={<span>Bell</span>}><p>x</p></AppShell>), /<div class="ck-bar-end"><span>Bell<\/span><\/div>/u, "toolsOn all: unchanged markup");
  assert.match(css, /\.ck-shell-full \.ck-bar-inner \{ max-width: none; \}/u);
  assert.match(css, /\.ck-member-text \{ position: absolute; top: 0; left: 0; width: 1px; height: 1px; margin: -1px;/u);
  assert.match(css, /\.ck-member \{ position: relative;/u);
});

test("LanguageSwitch and Tabs from a server component (Wiki, Support): an href pattern, a link component", () => {
  const langs = html(<LanguageSwitch languages={storeLanguages} current="en" label="Language" href="/p/{code}/pricing" link={Link} />);
  assert.match(langs, /href="\/p\/fr\/pricing"/u);
  assert.match(langs, /data-next=""/u);
  assert.match(html(<Tabs label="View" current="a" link={Link} items={[{ id: "a", label: "A", href: "?v=a" }, { id: "b", label: "B", href: "?v=b" }]} />), /data-next=""[^>]*aria-current="page"|aria-current="page"[^>]*data-next=""/u);
  // An inline wrapper is typed from the prop (this file does not compile
  // otherwise: Rooms writes `link={props => <Link {...props} scroll={false} />}`).
  assert.match(html(<Tabs label="View" current="a" link={props => <a data-inline="" {...props} />} items={[{ id: "a", label: "A", href: "?v=a" }]} />), /data-inline=""/u);
  assert.match(html(<Segmented label="View" value="a" link={props => <a data-inline="" {...props} />} options={[{ value: "a", label: "A", href: "?a" }, { value: "b", label: "B", href: "?b" }]} />), /data-inline=""/u);
});

test("Segmented link variant (CRM), Switch (Forms)", () => {
  const views = html(<Segmented label="View" value="board" link={Link} options={[{ value: "board", label: "Board", href: "/chest?view=board" }, { value: "list", label: "List", href: "/chest?view=list" }]} />);
  assert.match(views, /<nav class="ck-segmented ck-segmented-links" aria-label="View">/u);
  assert.match(views, /href="\/chest\?view=board" class="ck-segment-link" aria-current="page"/u);
  assert.match(views, /href="\/chest\?view=list" class="ck-segment-link"><span>List/u);
  assert.doesNotMatch(views, /type="radio"/u);
  const sw = html(<Switch label="Accept answers" checked onChange={noop} name="open" hint="People with the link can answer." />);
  assert.match(sw, /<input id="([^"]+)" type="checkbox" role="switch" class="ck-switch-input" aria-describedby="[^"]+-hint" name="open" checked="" value="on"\/><label for="\1" class="ck-switch-label">/u);
  assert.match(css, /\.ck-switch-label \{[^}]*min-height: var\(--control-h\)/u);
});

test("StatusBadge (Equipment): an icon with a category, and the dashed badge of what is not there yet", () => {
  const cat = html(<StatusBadge category={2} label="Laptop" icon={<svg className="kind" />} />);
  assert.match(cat, /<span class="ck-badge ck-badge-m ck-cat-2"><svg class="kind"><\/svg>Laptop<\/span>/u);
  assert.match(html(<StatusBadge category={2} label="Laptop" />), /ck-cat-dot/u, "the dot by default");
  assert.match(html(<StatusBadge label="No owner yet" empty />), /class="ck-badge ck-badge-m ck-tone-neutral ck-badge-empty"/u);
  assert.match(css, /\.ck-badge\.ck-badge-empty \{ background: none; color: var\(--ink-2\); border: var\(--border-width\) dashed var\(--line-strong\);/u);
});

test("PageHeader intro (People): a sentence is a <p>, more is a <div>", () => {
  assert.match(html(<PageHeader title="People" intro="Everyone in the company." />), /<p class="ck-page-intro">Everyone in the company\.<\/p>/u);
  assert.match(html(<PageHeader title="Léa" intro={<><span className="lead">Accounts</span><p>Joined in 2021.</p></>} className="profile" />), /<div class="ck-page-head profile">.*<div class="ck-page-intro"><span class="lead">Accounts<\/span><p>Joined in 2021\.<\/p><\/div>/u);
});

test("DataTable (CRM, Quotes, Equipment): header content, column class, sticky first column, stacked phone rows, rows that open a page", () => {
  type R = { id: string; client: string; total: string };
  const cols: Column<R>[] = [
    { key: "id", label: "Number", header: <><svg className="hash" />Number</>, value: r => r.id, rowHeader: true, className: "num" },
    { key: "client", label: "Client", value: r => r.client },
    { key: "total", label: "Total", render: r => r.total, align: "end" },
  ];
  const table = html(<DataTable caption="Quotes" rows={[{ id: "Q-14", client: "Atelier Martin", total: "€1,240.00" }]} rowKey={r => r.id} columns={cols} stickyFirst phone="stack" rowHref={r => `/chest/quotes/${r.id}`} link={Link} totals={{ total: "€1,240.00" }} labels={en.table}
    actions={() => [{ label: "Duplicate", onSelect: noop }]} />);
  assert.match(table, /<table class="ck-table ck-table-sticky ck-table-stack ck-table-linked">/u);
  assert.match(table, /<th scope="col" aria-sort="none"|<th scope="col" class="num">/u);
  assert.match(table, /<button type="button" class="ck-sort"><svg class="hash"><\/svg>Number/u, "the header's content, sortable");
  assert.match(table, /<th scope="row" class="num"><a data-next="" href="\/chest\/quotes\/Q-14" class="ck-row-link">Q-14<\/a><\/th>/u);
  assert.match(table, /<td data-label="Client">Atelier Martin<\/td>/u);
  assert.match(table, /<td class="ck-align-end" data-label="Total">€1,240.00<\/td>/u);
  assert.match(css, /\.ck-row-link::after \{ content: ""; position: absolute; inset: 0; \}/u);
  assert.match(css, /\.ck-table-sticky tbody > tr > :first-child \{ position: sticky; left: 0;/u);
  assert.match(css, /@media \(max-width: 640px\) \{\s*\.ck-table-stack, \.ck-table-stack tbody, \.ck-table-stack tfoot, \.ck-table-stack tr \{ display: block;/u);
  const plain = html(<DataTable caption="Quotes" rows={[{ id: "Q-14", client: "A", total: "1" }]} rowKey={r => r.id} columns={cols} />);
  assert.match(plain, /<table class="ck-table">/u);
  assert.doesNotMatch(plain, /data-label|ck-row-link/u, "unchanged without the options");
});

test("Menu items (Support, Equipment, Wiki): an id for keys, a second line, downloads and a link component — played in check-flows", () => {
  // A closed menu renders no item; the open one is played in the browser.
  const source = readFileSync(join(ui, "src", "components", "menu.tsx"), "utf8");
  assert.match(source, /key=\{item\.id \?\? `\$\{i\}-\$\{item\.label\}`\}/u, "two items of one label never share a key");
  assert.match(source, /download=\{item\.download === true \? "" : item\.download\}/u);
});

// ---------- 4. tokens: the region of its own colour, the reading face, chips' corners, fields' padding ----------

test("the contract's new tokens: --inverse and its measured pairs, --font-read, --radius-chip, --field-pad-x", () => {
  for (const t of ["inverse", "inverse-ink", "inverse-ink-2", "inverse-line"]) assert.ok((colorTokens as readonly string[]).includes(t), t);
  for (const t of ["font-read", "radius-chip", "field-pad-x"]) assert.ok((staticTokens as readonly string[]).includes(t), t);
  assert.ok(pairs.some(p => p.fg === "inverse-ink" && p.on.includes("inverse") && p.on.includes("inverse-line") && p.min === 4.5));
  assert.ok(pairs.some(p => p.fg === "inverse-ink-2" && p.on.includes("inverse") && p.min === 4.5));
  for (const theme of catalogue) for (const mode of ["light", "dark"] as const) {
    const s = theme[mode];
    assert.ok(contrast(s["inverse-ink"], s.inverse) >= 4.5 && contrast(s["inverse-ink-2"], s.inverse) >= 4.5 && contrast(s["inverse-ink"], s["inverse-line"]) >= 4.5, `${theme.id} ${mode}`);
    if (theme.modes === "both") assert.ok(contrast(s.inverse, "#ffffff") >= 4.5, `${theme.id} ${mode}: the region stays dark in both modes (${s.inverse})`);
  }
  // Equipment's steel is no longer the ink (it collapsed to black in Chest-like inks).
  const labels = themeOf("labels")!;
  assert.notEqual(labels.light.inverse, labels.light.ink);
  assert.equal(labels.dark.inverse, "#222b32");
  // Fonts for reading.
  assert.equal(themeOf("library")!.fonts.read!.id, "newsreader");
  assert.equal(themeOf("letterpress")!.fonts.read!.id, "libre-caslon-text");
  assert.equal(themeOf("trail")!.fonts.read!.id, "work-sans", "Trail reads in its body face, never Barlow Semi Condensed");
  assert.equal(themeOf("confetti")!.fonts.read!.id, "plus-jakarta-sans", "never Fredoka");
  assert.equal(themeOf("appointment")!.fonts.read!.id, "figtree", "never Young Serif");
  assert.ok(themeCss(themeOf("library")!).includes("--font-read:'Newsreader Variable'"));
  assert.ok(catalogueFonts.some(f => f.id === "newsreader"));
  // Chips follow the corners.
  assert.match(themeCss(themeOf("chest")!), /--radius-chip:0px/u);
  assert.match(themeCss(themeOf("workshop")!), /--radius-chip:999px/u);
  assert.match(themeCss(deriveTheme({ primary: "#2b59c3", corners: "sharp" }).theme), /--radius-chip:2px/u);
  assert.match(themeCss(themeOf("workshop")!), /--field-pad-x:12px/u);
  // A brand's region: its main colour's deep shade, measured.
  const brand = deriveTheme({ primary: "#e4572e" }).theme;
  assert.deepEqual(checkTheme(brand), []);
  assert.notEqual(brand.light.inverse, brand.light.ink);
});

test("a hand-made theme of 0.2.1 (no read font, no chip radius, no field padding) is still valid and gets the defaults", () => {
  const t = identityOf("tasks")!;
  const { read: _r, ...fonts } = t.fonts;
  const old = { ...t, fonts, radius: { s: t.radius.s, m: t.radius.m, l: t.radius.l } };
  assert.deepEqual(validateTheme(old), []);
  const out = themeCss(old);
  assert.ok(out.includes(`--font-read:${t.fonts.body.stack}`));
  assert.ok(validateTheme({ ...old, fieldPad: 40 }).length > 0);
  assert.ok(validateTheme({ ...old, radius: { ...old.radius, chip: 500 } }).length > 0);
  // A tool's identity through defineTheme gets every new token, measured.
  const mine = defineTheme({ id: "mine", name: { en: "Mine", fr: "Le mien" }, description: { en: "Mine.", fr: "Le mien." }, fonts: { display: "inter", body: "inter" }, radius: { s: 4, m: 8, l: 12 },
    light: { bg: "#ffffff", surface: "#ffffff", ink: "#111111", "ink-2": "#555555", line: "#dddddd", accent: "#0055cc", "accent-ink": "#ffffff" },
    dark: { bg: "#111111", surface: "#1b1b1b", ink: "#eeeeee", "ink-2": "#aaaaaa", line: "#333333", accent: "#88aaff", "accent-ink": "#111111" } });
  assert.deepEqual(checkTheme(mine), []);
  assert.equal(mine.fonts.read!.id, "inter");
});

test("fonts declared from files carry their unicode-range (Forms): two subset files of one face no longer hide each other", () => {
  const faces = fontFaces([{ family: "DM Sans", stack: "'DM Sans', sans-serif", files: [
    { url: "/fonts/dm-sans-latin-wght-normal.woff2", weight: "100 900", style: "normal", range: "U+0000-00FF,U+0131,U+0152-0153" },
    { url: "/fonts/dm-sans-latin-ext-wght-normal.woff2", weight: "100 900", style: "normal", range: "U+0100-02BA" },
    { url: "/fonts/x.woff2", weight: "400", style: "normal", range: "U+0000-00FF;} body{color:red" },
  ] }], "/fonts");
  assert.match(faces, /dm-sans-latin-wght-normal\.woff2\) format\('woff2'\);unicode-range:U\+0000-00FF,U\+0131,U\+0152-0153\}/u);
  assert.match(faces, /dm-sans-latin-ext-wght-normal\.woff2\) format\('woff2'\);unicode-range:U\+0100-02BA\}/u);
  assert.match(faces, /x\.woff2\) format\('woff2'\)\}/u, "a range that is not one is left out");
  assert.doesNotMatch(faces, /color:red/u);
});

test("Forms joins the catalogue: Invitation, DM Serif Display and DM Sans, its berry", () => {
  const forms = identityOf("forms")!;
  assert.equal(forms.id, "forms");
  assert.equal(forms.name.en, "Invitation");
  assert.equal(forms.fonts.display.id, "dm-serif-display");
  assert.equal(forms.fonts.body.id, "dm-sans");
  assert.equal(forms.light.accent, "#b0124f");
  assert.equal(forms.light["cat-5"], "#b0124f", "the berry is the pink slot");
  assert.deepEqual(checkTheme(forms), []);
  assert.deepEqual(validateTheme(forms), []);
});

test("DateRangeField (0.2.1's deferred date range, Leave): two days under one name, the length kept when the start moves, never an end before the start", () => {
  assert.deepEqual(moveRangeStart({ from: "2026-10-05", to: "2026-10-07" }, "2026-10-12"), { from: "2026-10-12", to: "2026-10-14" }, "three days stay three days");
  assert.deepEqual(moveRangeStart({ from: null, to: "2026-10-07" }, "2026-10-09"), { from: "2026-10-09", to: "2026-10-09" }, "no length yet: the end follows only when passed");
  assert.deepEqual(moveRangeStart({ from: null, to: "2026-10-07" }, "2026-10-02"), { from: "2026-10-02", to: "2026-10-07" });
  assert.deepEqual(moveRangeStart({ from: "2026-10-05", to: "2026-10-07" }, null), { from: null, to: "2026-10-07" });
  assert.deepEqual(moveRangeEnd({ from: "2026-10-05", to: "2026-10-07" }, "2026-10-01"), { from: "2026-10-05", to: "2026-10-05" });
  assert.deepEqual(moveRangeEnd({ from: "2026-10-05", to: null }, "2026-10-09"), { from: "2026-10-05", to: "2026-10-09" });
  assert.equal(rangeDays({ from: "2026-10-05", to: "2026-10-07" }), 3);
  assert.equal(rangeDays({ from: "2026-12-31", to: "2027-01-01" }), 2);
  assert.equal(rangeDays({ from: "2026-10-05", to: null }), null);
  const field = html(<DateRangeField label="Leave" value={{ from: "2026-10-05", to: "2026-10-07" }} onChange={noop} today="2026-09-29" names={{ from: "from", to: "to" }} labels={fr.date} lang="fr" hint="Weekends are not counted." />);
  assert.match(field, /<fieldset class="ck-range" aria-describedby="[^"]+-hint"><legend class="ck-label">Leave<\/legend>/u);
  assert.match(field, /<label id="[^"]+" class="ck-label" for="[^"]+">Du<\/label>/u);
  assert.match(field, /<label id="[^"]+" class="ck-label" for="[^"]+">Au<\/label>/u);
  assert.match(field, /<p class="ck-hint ck-range-length" aria-live="polite">3 jours<\/p>/u);
  assert.match(field, /<input type="hidden" name="from" value="2026-10-05"\/>.*<input type="hidden" name="to" value="2026-10-07"\/>/u);
  assert.doesNotMatch(field, /ck-chip-button/u, "no Today/Tomorrow chips in a range");
});

test("a tool's own copy of its identity (defineTheme of the same source) gets 0.2.2's additions too: the catalogue and the copy stay equal with no change in the tool", () => {
  // Equipment, Timesheets, Goals, Wiki and Quotes each hold a copy of the
  // catalogue's source and test deepEqual(identity, identityOf(tool)).
  const base = { name: { en: "x", fr: "x" }, description: { en: "x", fr: "x" }, fonts: { display: "newsreader", body: "source-sans-3" }, radius: { s: 4, m: 6, l: 10 },
    light: { bg: "#f4f2ee", surface: "#ffffff", ink: "#1b1f22", "ink-2": "#56606a", line: "#d9d5cc", accent: "#c2410c", "accent-ink": "#ffffff" },
    dark: { bg: "#14181b", surface: "#1d2226", ink: "#eef1f3", "ink-2": "#a9b4bd", line: "#353d44", accent: "#ff8a4c", "accent-ink": "#1b1f22" } };
  const steel = defineTheme({ ...base, id: "labels", tool: "equipment" });
  assert.equal(steel.light.inverse, "#2e3d48");
  assert.equal(steel.dark["inverse-ink-2"], "#b7c3cc");
  const other = defineTheme({ ...base, id: "labels", tool: "stock" });
  assert.equal(other.light.inverse, other.light.ink, "another tool of the same id: the default band");
  const own = defineTheme({ ...base, id: "labels", tool: "equipment", light: { ...base.light, inverse: "#123456" } });
  assert.equal(own.light.inverse, "#123456", "what the source says wins");
  assert.equal(defineTheme({ ...base, id: "library", tool: "wiki" }).fonts.read!.id, "newsreader");
  assert.equal(defineTheme({ ...base, id: "library" }).fonts.read!.id, "source-sans-3", "no tool: no addition");
  for (const [id, a] of Object.entries(identityAdditions)) assert.equal(identityOf(a.tool)!.id, id, `${id} is ${a.tool}'s identity`);
});
