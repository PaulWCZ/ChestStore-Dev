import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import type { ReactElement } from "react";
import { renderToString, renderToStaticMarkup } from "react-dom/server";
import { allTokens } from "../src/contract.js";
import {
  AppShell, Avatar, AvatarStack, BrandMark, Confirm, DataTable, DateField, DayStrip, Dialog, EmptyState, FilePicker, Filters,
  LanguageSwitch, MemberChip, Menu, Nav, NoAccess, PageHeader, PeoplePicker, SearchBox, Segmented, StatusBadge, Tabs, TimeSelect, Toasts,
  type Column, type PickedFile,
} from "../src/components/index.js";
import { en, fr, storeLanguages } from "../src/components/words.js";
import { localSearch } from "../src/components/people.js";

// build/test → ui/
const ui = join(import.meta.dirname, "..", "..");
const html = (el: ReactElement) => renderToStaticMarkup(el);
const noop = () => {};

// Every id in a page appears once; every reference names an id that exists.
function checkIds(markup: string, label: string) {
  const ids = [...markup.matchAll(/\sid="([^"]+)"/gu)].map(m => m[1]!);
  assert.equal(new Set(ids).size, ids.length, `${label}: duplicate id in ${ids.join(", ")}`);
  for (const m of markup.matchAll(/\s(?:aria-labelledby|aria-describedby|aria-controls|for)="([^"]+)"/gu)) {
    for (const ref of m[1]!.split(/\s+/u)) assert.ok(ids.includes(ref), `${label}: ${m[0]!.trim()} names a missing id`);
  }
}

// ---------- a whole page, in English and French ----------

type Row = { id: string; name: string; amount: number; state: "paid" | "late" };
const rows: Row[] = [{ id: "q1", name: "Atelier Martin", amount: 1200, state: "paid" }, { id: "q2", name: "Boulangerie Léa", amount: 340, state: "late" }];
const columns: Column<Row>[] = [
  { key: "name", label: "Client", value: r => r.name, rowHeader: true },
  { key: "amount", label: "Amount", value: r => r.amount, align: "end" },
  { key: "state", label: "State", render: r => <StatusBadge tone={r.state === "paid" ? "ok" : "danger"} label={r.state} /> },
];

function page(lang: "en" | "fr") {
  const w = lang === "fr" ? fr : en;
  return (
    <Toasts labels={w.toast}>
      <AppShell brand={<a href="/chest">Notes</a>} path="/chest/quotes/42" labels={w.shell} member={{ name: "Camille Martin", role: "Manager", photo: null }}
        nav={[{ href: "/chest", label: "Home" }, { href: "/chest/quotes", label: "Quotes", count: 3 }, { href: "/chest/settings", label: "Settings" }]}>
        <PageHeader title="Quotes" intro="Everything you sent." action={<a className="ck-button" href="/chest/quotes/new">New quote</a>} />
        <Filters path="/chest/quotes" params="state=sent&q=acme" labels={w.filters} groups={[{ key: "state", label: "State", all: true, options: [{ value: "sent", label: "Sent", count: 4 }, { value: "paid", label: "Paid", count: 2 }] }]} />
        <SearchBox action="/chest/quotes" value="acme" labels={w.search} keep={{ state: "sent" }} />
        <DataTable caption="Quotes" columns={columns} rows={rows} rowKey={r => r.id} rowName={r => r.name} labels={w.table} actions={() => [{ label: "Duplicate", onSelect: noop }, { label: "Delete", onSelect: noop, tone: "danger" }]} totals={{ amount: "1 540 €" }} />
        <DateField label="Due" value="2026-10-01" onChange={noop} today="2026-09-29" labels={w.date} />
        <PeoplePicker label="Owner" search={localSearch([])} value={[{ id: "mbr_lea", name: "Léa Moreau" }]} onChange={noop} multiple labels={w.peoplePicker} lang={lang} name="owners" />
        <FilePicker label="Receipts" files={[]} onChange={noop} maxFiles={3} maxSize={10 * 1024 * 1024} accept={["image/*", ".pdf"]} labels={w.files} />
        <Dialog open={false} title="New quote" onClose={noop} labels={w.dialog}><input /></Dialog>
      </AppShell>
    </Toasts>
  );
}

test("a page of kit components renders on the server, with unique ids and working references, in both languages", () => {
  for (const lang of ["en", "fr"] as const) {
    const markup = renderToString(page(lang));
    checkIds(markup, lang);
    assert.match(markup, /<a class="ck-skip" href="#main">/u);
    assert.match(markup, /<main id="main"/u);
    assert.match(markup, /role="status" aria-live="polite"/u, "the toasts' live region exists from the first render");
    assert.match(markup, /aria-current="page"[^>]*>(<span[^>]*>)*Quotes/u, "the section of a sub-page is current");
    assert.ok(!markup.includes("style="), "no inline style: the strict policy needs none");
  }
  const french = renderToString(page("fr"));
  assert.ok(french.includes("Aller au contenu"));
  assert.ok(french.includes("01/10/2026"));
  assert.ok(french.includes(">jeudi 1 octobre 2026<"), "the day in words, under the field");
  assert.ok(french.includes("Retirer les filtres"));
  assert.ok(french.includes("Jusqu’à 3 fichiers, 10 Mo chacun."));
});

test("server rendering does not depend on the machine's time zone or clock", () => {
  const before = process.env.TZ;
  try {
    process.env.TZ = "Pacific/Kiritimati";
    const a = renderToString(page("fr"));
    process.env.TZ = "America/Adak";
    const b = renderToString(page("fr"));
    assert.equal(a, b);
  } finally {
    if (before === undefined) delete process.env.TZ;
    else process.env.TZ = before;
  }
});

// ---------- one component at a time ----------

test("DateField: a text field in the tool's language (never type=date), today and tomorrow, the reading of the day", () => {
  const markup = html(<DateField label="Échéance" value="2026-09-30" onChange={noop} today="2026-09-29" labels={fr.date} name="due" hint="Le jour où c’est dû." />);
  assert.ok(!markup.includes('type="date"'));
  assert.match(markup, /<input[^>]*type="text"[^>]*placeholder="jj\/mm\/aaaa"[^>]*value="30\/09\/2026"/u);
  assert.match(markup, /aria-pressed="true"[^>]*>Demain</u);
  assert.match(markup, /Demain · mercredi 30 septembre 2026/u);
  assert.match(markup, /<input type="hidden" name="due" value="2026-09-30"/u);
  assert.match(markup, /aria-haspopup="dialog"/u);
  const bounded = html(<DateField label="Day" value={null} onChange={noop} today="2026-09-29" min="2026-09-30" labels={en.date} />);
  assert.ok(!bounded.includes(">Today<"), "a chip outside min…max is not offered");
  assert.ok(bounded.includes(">Tomorrow<"));
});

test("DayStrip: tiles named in the tool's language, the current day marked, today said", () => {
  const markup = html(<DayStrip days={["2026-09-29", "2026-09-30", "2026-10-01"]} current="2026-09-30" today="2026-09-29" href={d => `/chest?day=${d}`} labels={fr.date} />);
  assert.match(markup, /href="\/chest\?day=2026-09-30"[^>]*aria-current="date"/u);
  assert.match(markup, /aria-label="Aujourd’hui, mardi 29 septembre 2026"/u);
  assert.match(markup, /<span class="ck-dow">jeu\.<\/span>/u);
  const buttons = html(<DayStrip days={["2026-09-29"]} current={null} today="2026-09-29" onPick={noop} labels={en.date} />);
  // 0.2.6: buttons are a listbox's options, one Tab stop (test/kit-026.test.tsx).
  assert.match(buttons, /<button type="button" role="option" class="ck-daytile ck-is-today" aria-selected="false"/u);
});

test("TimeSelect: 24-hour options, 24:00 for an end, an odd value kept", () => {
  const end = html(<TimeSelect id="t" value={1440} onChange={noop} end step={30} />);
  assert.match(end, /<option value="1440" selected="">24:00<\/option>/u);
  assert.ok(!end.includes(">00:00<"), "an end never offers midnight at the start of the day");
  assert.ok(!/AM|PM/u.test(end));
  const odd = html(<TimeSelect id="t" defaultValue={550} step={60} />);
  assert.match(odd, /<option value="550" selected="">09:10<\/option>/u);
});

test("PeoplePicker: an ARIA 1.2 combobox with chips that can be removed and hidden inputs for a form", () => {
  const markup = html(<PeoplePicker label="Guests" search={localSearch([])} value={[{ id: "mbr_lea", name: "Léa Moreau" }, { kind: "group", id: "grp_sales", name: "Sales" }]} onChange={noop} multiple name="guests" labels={fr.peoplePicker} />);
  assert.match(markup, /role="combobox"/u);
  assert.match(markup, /aria-autocomplete="list"/u);
  assert.match(markup, /aria-expanded="false"/u);
  assert.match(markup, /role="listbox"[^>]*aria-multiselectable="true"/u);
  assert.match(markup, /Retirer Léa Moreau/u);
  assert.match(markup, /<input type="hidden" name="guests" value="mbr_lea"\/><input type="hidden" name="guests" value="grp_sales"\/>/u);
  checkIds(markup, "picker");
  const single = html(<PeoplePicker label="Owner" search={localSearch([])} value={[{ id: "mbr_lea", name: "Léa Moreau" }]} onChange={noop} />);
  assert.match(single, /value="Léa Moreau"/u, "a single choice reads in the field");
});

test("Dialog and Confirm: native dialogs, labelled, with unique ids; Confirm is an alertdialog", () => {
  const two = html(<><Dialog open={false} title="One" onClose={noop} /><Dialog open={false} title="Two" onClose={noop} description="More words." /></>);
  checkIds(two, "dialogs");
  assert.equal((two.match(/<dialog/gu) ?? []).length, 2);
  assert.match(two, /aria-describedby/u);
  const confirm = html(<Confirm open={false} title="Erase Léa’s data?" body="This cannot be undone." confirmLabel="Erase" cancelLabel="Cancel" onConfirm={noop} onCancel={noop} />);
  assert.match(confirm, /<dialog role="alertdialog"/u);
  assert.match(confirm, /ck-button ck-button-danger/u);
  checkIds(confirm, "confirm");
});

test("DataTable: sortable headers with aria-sort, a row header, totals, a menu per row, an empty state", () => {
  const markup = html(<DataTable caption="Quotes" columns={columns} rows={rows} rowKey={r => r.id} rowName={r => r.name} actions={() => [{ label: "Delete", onSelect: noop }]} totals={{ amount: "1540" }} sort={{ key: "amount", dir: "desc" }} onSort={noop} labels={en.table} />);
  assert.match(markup, /<th scope="col" aria-sort="descending" class="ck-align-end"><button type="button" class="ck-sort">Amount/u);
  assert.match(markup, /<th scope="row">Atelier Martin<\/th>/u);
  assert.match(markup, /<tfoot><tr><th scope="row">Total<\/th><td class="ck-align-end">1540<\/td>/u);
  assert.match(markup, /aria-haspopup="menu"/u);
  assert.match(markup, /Actions for Boulangerie Léa/u);
  assert.match(markup, /role="region" aria-label="Quotes \(scrolls sideways\)" tabindex="0"/u, "a scrolling region is reachable by keyboard");
  const linked = html(<DataTable caption="Quotes" columns={columns} rows={rows} rowKey={r => r.id} sort={null} sortHref={s => `?sort=${s.key}&dir=${s.dir}`} />);
  assert.match(linked, /<a class="ck-sort" href="\?sort=amount&amp;dir=asc">/u);
  const empty = html(<DataTable caption="Quotes" columns={columns} rows={[]} rowKey={r => r.id} empty={<EmptyState title="No quotes yet" />} />);
  assert.ok(!empty.includes("<table"));
  assert.match(empty, /No quotes yet/u);
});

test("Filters and SearchBox: links that keep the address, counts, Clear, a '/' shortcut", () => {
  const markup = html(<Filters path="/chest/q" params={{ state: "sent", q: "acme" }} labels={en.filters} groups={[{ key: "state", label: "State", options: [{ value: "sent", label: "Sent", count: 4 }, { value: "paid", label: "Paid", count: 0 }] }]} />);
  assert.match(markup, /href="\/chest\/q\?q=acme" class="ck-filter-chip" aria-current="true"><span>Sent<\/span><span class="ck-count">4<\/span>/u);
  assert.match(markup, /href="\/chest\/q\?state=paid&amp;q=acme"/u);
  assert.match(markup, /class="ck-filter-clear">Clear filters</u);
  const none = html(<Filters path="/chest/q" params="" groups={[{ key: "state", label: "State", options: [] }]} />);
  assert.ok(!none.includes("ck-filter-clear"), "Clear only when a filter is on");
  const search = html(<SearchBox action="/chest/q" value="acme" keep={{ state: "sent", owner: undefined }} labels={fr.search} />);
  assert.match(search, /role="search"/u);
  assert.match(search, /<input type="hidden" name="state" value="sent"\/>/u);
  assert.ok(!search.includes('name="owner"'));
  assert.match(search, /aria-keyshortcuts="\/"/u);
  assert.match(search, /<label[^>]*>Rechercher<\/label>/u);
});

test("FilePicker: stated limits, a real file input behind a visible button, remove and progress per file", () => {
  const files: PickedFile[] = [
    { key: "a", name: "ticket.jpg", size: 1_500_000, type: "image/jpeg", file: null, status: "sending", progress: 0.42, ref: null, error: null },
    { key: "b", name: "devis.pdf", size: 300_000, type: "application/pdf", file: null, status: "ready", progress: 1, ref: "obj_1", error: null },
  ];
  const markup = html(<FilePicker label="Justificatifs" files={files} onChange={noop} maxFiles={2} maxSize={5 * 1024 * 1024} accept={["image/*", ".pdf"]} capture="environment" name="receipts" labels={fr.files} />);
  assert.match(markup, /<input[^>]*type="file"[^>]*multiple=""[^>]*accept="image\/\*,\.pdf"[^>]*capture="environment"[^>]*disabled=""/u, "full: no more files");
  assert.match(markup, /Jusqu’à 2 fichiers, 5 Mo chacun\. Acceptés : images, PDF\./u);
  assert.match(markup, /Envoi… 42 %/u);
  assert.match(markup, /<progress class="ck-progress" max="1" value="0.42"/u);
  assert.match(markup, /Retirer devis\.pdf/u);
  assert.match(markup, /<input type="hidden" name="receipts" value="obj_1"\/>/u);
  assert.ok(!markup.includes('value="null"'));
});

test("Avatar and AvatarStack: decorative by default, named when alone, the rest counted", () => {
  assert.equal(html(<Avatar name="Camille Martin" />), '<span class="ck-avatar ck-avatar-m" aria-hidden="true">CM</span>');
  assert.match(html(<Avatar name="Léa" photo="/_chest/photos/l.jpg" />), /<img class="ck-avatar ck-avatar-m" src="\/_chest\/photos\/l.jpg" alt=""/u);
  assert.match(html(<Avatar name="Léa Moreau" label="Léa Moreau" />), /role="img" aria-label="Léa Moreau"/u);
  const stack = html(<AvatarStack people={[{ name: "Léa Moreau" }, { name: "Hugo Bernard" }, { name: "Tom Petit" }, { name: "Nora Diallo" }]} labels={fr.shell} lang="fr" />);
  assert.match(stack, /aria-label="Léa Moreau, Hugo Bernard et 2 autres"/u);
  assert.match(stack, />\+2</u);
  assert.equal(html(<AvatarStack people={[]} />), "");
});

test("StatusBadge, EmptyState, NoAccess, Tabs, Segmented, Menu", () => {
  assert.match(html(<StatusBadge tone="ok" label="Paid" />), /<span class="ck-badge ck-badge-m ck-tone-ok"><svg[^>]*aria-hidden="true"[^>]*>.*<\/svg>Paid<\/span>/u, "a shape and a word, never colour alone");
  assert.match(html(<StatusBadge category={3} label="Sick leave" />), /ck-cat-3/u);
  const empty = html(<EmptyState title="No rooms yet" body="Rooms are the places people book." note="An admin adds the rooms." example={{ onClick: noop }} labels={fr.shell} />);
  assert.match(empty, /Commencer avec un exemple/u);
  assert.match(empty, /An admin adds the rooms/u);
  assert.match(html(<NoAccess labels={fr.shell} />), /Vous ne pouvez pas encore utiliser cet outil/u);
  const links = html(<Tabs label="Bookings" current="past" items={[{ id: "up", label: "Upcoming", count: 3, href: "?tab=up" }, { id: "past", label: "Past", href: "?tab=past" }]} />);
  assert.match(links, /<nav class="ck-tabs" aria-label="Bookings">/u);
  assert.match(links, /href="\?tab=past" class="ck-tab" aria-current="page"/u);
  const list = html(<Tabs label="View" current="b" onChange={noop} items={[{ id: "a", label: "A" }, { id: "b", label: "B", count: 2 }]}><p>Panel</p></Tabs>);
  assert.match(list, /role="tablist"/u);
  assert.match(list, /role="tab"[^>]*aria-selected="false"[^>]*tabindex="-1"/u);
  assert.match(list, /role="tab"[^>]*aria-selected="true"[^>]*tabindex="0"/u);
  checkIds(list, "tabs");
  const seg = html(<Segmented label="View" value="list" onChange={noop} options={[{ value: "board", label: "Board" }, { value: "list", label: "List" }]} />);
  assert.match(seg, /<fieldset class="ck-segmented"><legend class="ck-vh">View<\/legend>/u);
  assert.match(seg, /type="radio"[^>]*checked=""[^>]*value="list"/u);
  assert.throws(() => html(<Segmented label="x" value="a" onChange={noop} options={["a", "b", "c", "d", "e"].map(v => ({ value: v, label: v }))} />), RangeError);
  assert.match(html(<Menu label="More for Q-12" items={[{ label: "Delete", onSelect: noop }]} />), /aria-haspopup="menu" aria-expanded="false"[^>]*>.*<span class="ck-vh">More for Q-12<\/span>/u);
});

test("the shell: labelled tabs (never icons alone), the member chip, the language switch, the brand's logo", () => {
  const nav = html(<Nav label="Main" path="/chest/boards/7" items={[{ href: "/chest", label: "Home", icon: <svg /> }, { href: "/chest/boards", label: "Boards", count: 2 }]} />);
  assert.match(nav, /<a href="\/chest" class="ck-nav-link"><span class="ck-nav-icon" aria-hidden="true"><svg><\/svg><\/span><span class="ck-nav-label">Home<\/span>/u);
  assert.match(nav, /href="\/chest\/boards" class="ck-nav-link" aria-current="page"/u);
  assert.match(html(<MemberChip name="Camille Martin" role="Manager" />), /Camille Martin.*Manager/u);
  const langs = html(<LanguageSwitch languages={storeLanguages} current="fr" label="Langue" back="/jobs" />);
  assert.match(langs, /href="\/lang\/en\?back=%2Fjobs" hrefLang="en" lang="en" class="ck-language">English/u);
  assert.match(langs, /lang="fr" class="ck-language" aria-current="true">Français/u);
  assert.match(html(<BrandMark logo={{ url: "/_chest/theme/brand/logo.svg", alt: "Atelier Martin", dark: "/_chest/theme/brand/logo-dark.svg" }} />), /<source srcSet="\/_chest\/theme\/brand\/logo-dark.svg" media="\(prefers-color-scheme: dark\)"\/><img src="\/_chest\/theme\/brand\/logo.svg" alt="Atelier Martin"\/>/u);
  assert.equal(html(<BrandMark logo={null}><svg /></BrandMark>), "<svg></svg>");
  const custom = html(<Nav label="Main" path="/chest" items={[{ href: "/chest", label: "Home" }]} link={({ children, ...p }) => <a data-link="next" {...p}>{children}</a>} />);
  assert.match(custom, /data-link="next"/u, "a tool's own link component (Next.js <Link>)");
});

// ---------- the stylesheet ----------

const css = readFileSync(join(ui, "css", "components.css"), "utf8");
const cssNoComments = css.replace(/\/\*[\s\S]*?\*\//gu, "");

test("the stylesheet names no colour: only contract tokens (and the kit's own --ck-* knobs)", () => {
  const colours = [...cssNoComments.matchAll(/#[0-9a-fA-F]{3,8}\b|\b(rgba?|hsla?|oklch|color-mix)\(|(?<![-\w])(white|black|red|blue|green|gray|grey)(?![-\w])/gu)].map(m => m[0]);
  assert.deepEqual(colours, []);
  const known = new Set<string>(allTokens);
  const unknown = [...new Set([...cssNoComments.matchAll(/var\((--[\w-]+)/gu)].map(m => m[1]!))].filter(v => !known.has(v) && !v.startsWith("--ck-"));
  assert.deepEqual(unknown, [], "every var() is a contract token");
});

test("every class the components write is styled, and the stylesheet styles no class they do not write", () => {
  const dir = join(ui, "src", "components");
  const source = readdirSync(dir).filter(f => f.endsWith(".tsx")).map(f => readFileSync(join(dir, f), "utf8")).join("\n");
  const written = new Set([...source.matchAll(/\bck-[a-z0-9-]+/gu)].map(m => m[0]).filter(c => !c.endsWith("-")));
  const styled = new Set([...cssNoComments.matchAll(/\.(ck-[a-z0-9-]+)/gu)].map(m => m[1]!));
  // Classes built from a value (ck-avatar-${size}, ck-tone-${tone}…) are listed here.
  const built = ["ck-avatar-s", "ck-avatar-m", "ck-avatar-l", "ck-avatar-xl", "ck-stack-s", "ck-stack-l", "ck-stack-xl", "ck-tone-ok", "ck-tone-wait", "ck-tone-danger", "ck-tone-info", "ck-tone-neutral", "ck-badge-s", "ck-dialog-s", "ck-dialog-l", "ck-main-narrow", "ck-main-normal", "ck-main-wide", "ck-align-end", "ck-align-center", "ck-col-narrow", "ck-col-wide", "ck-menu-end", "ck-menu-start", "ck-sort-asc", "ck-sort-desc", "ck-sort-none", "ck-file-failed", "ck-shell-full", ...[1, 2, 3, 4, 5, 6, 7, 8].map(n => `ck-cat-${n}`)];
  for (const c of built) written.add(c);
  const unstyled = [...written].filter(c => !styled.has(c) && !["ck-shell", "ck-tabs-block", "ck-nav-label", "ck-file-sending", "ck-file-ready", "ck-files", "ck-state-icon", "ck-confirm-body", "ck-badge-m", "ck-avatar-m", "ck-dialog-m", "ck-stack-m", "ck-main-full", "ck-shell-narrow", "ck-shell-normal", "ck-shell-wide", "ck-nav-1", "ck-nav-2", "ck-nav-3", "ck-nav-4", "ck-nav-5"].includes(c));
  assert.deepEqual(unstyled, [], "classes written but never styled");
  const unused = [...styled].filter(c => !written.has(c));
  assert.deepEqual(unused, [], "classes styled but never written");
});

test("the stylesheet honours the platform: targets of 44 px, reduced motion, a visible focus", () => {
  assert.match(css, /min-height: var\(--control-h\)/u);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/u);
  assert.match(css, /:focus-visible \{ outline: 3px solid var\(--focus\)/u);
  assert.match(css, /@media \(max-width: 760px\)/u, "the phone navigation rule");
});
