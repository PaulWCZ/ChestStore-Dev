// What 0.2.1 adds or fixes, reported by the first migrations (Booking,
// Rooms, Timesheets). Each is also played in a browser by
// scripts/gallery/check-flows.mjs or check-page.mjs where a layout is
// involved.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { forwardRef, type AnchorHTMLAttributes, type MouseEventHandler, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppShell, DateField, DayStrip, Filters, LanguageSwitch, Nav, NavLink, PageHeader, SearchBox, Tabs, type LinkComponent, type NavItem } from "../src/components/index.js";
import { en, fr, storeLanguages } from "../src/components/words.js";

const ui = join(import.meta.dirname, "..", "..");
const html = (el: ReactElement) => renderToStaticMarkup(el);
const noop = () => {};

// A stand-in of Next.js's `Link` of the same shape (next 16,
// dist/client/link.d.ts): a forwardRef exotic component — an object, not a
// function — whose props are the anchor's attributes and Next's own, with
// `href: string | UrlObject`. Passing it where the kit takes a link, with
// no cast, is the type test (this file does not compile otherwise); and
// `npm run check:package` does the same with the real `next/link` when the
// studio has it installed.
type UrlObject = { pathname?: string | null; query?: string | null | Readonly<Record<string, string>>; hash?: string | null };
type NextLinkOwnProps = {
  href: string | UrlObject;
  as?: string | UrlObject;
  replace?: boolean;
  scroll?: boolean;
  shallow?: boolean;
  passHref?: boolean;
  prefetch?: boolean | "auto" | null;
  locale?: string | false;
  legacyBehavior?: boolean;
  onMouseEnter?: MouseEventHandler<HTMLAnchorElement>;
  onNavigate?: (event: { preventDefault: () => void }) => void;
};
const Link = forwardRef<HTMLAnchorElement, Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof NextLinkOwnProps> & NextLinkOwnProps & { children?: ReactNode }>(
  function Link({ href, as: _as, replace: _r, scroll: _s, shallow: _sh, passHref: _p, prefetch: _pf, locale: _l, legacyBehavior: _lb, onNavigate: _n, ...rest }, ref) {
    return <a ref={ref} href={typeof href === "string" ? href : href.pathname ?? ""} data-next="" {...rest} />;
  },
);

test("Next.js's Link fits every link prop as it is (types), and is rendered, never called", () => {
  assert.equal(typeof Link, "object", "the stand-in is an exotic component, like Next's");
  const asKit: LinkComponent = Link; // the exported type accepts it
  const nav: NavItem[] = [{ href: "/chest", label: "Home" }, { href: "/chest/rooms", label: "Rooms" }];
  const shell = html(<AppShell brand="Rooms" nav={nav} path="/chest/rooms/3" link={Link} labels={en.shell}><p>Page</p></AppShell>);
  assert.match(shell, /<a data-next="" href="\/chest\/rooms" class="ck-nav-link" aria-current="page">|<a href="\/chest\/rooms" data-next="" class="ck-nav-link" aria-current="page">|href="\/chest\/rooms"[^>]*aria-current="page"/u);
  assert.match(shell, /data-next=""/u);
  assert.match(html(<Nav items={nav} path="/chest" label="Sections" link={asKit} />), /data-next=""/u);
  assert.match(html(<NavLink href="/chest/a" path="/chest/a" link={Link}>A</NavLink>), /data-next=""[^>]*aria-current="page"|aria-current="page"[^>]*data-next=""/u);
  assert.match(html(<Tabs label="Bookings" current="up" link={Link} items={[{ id: "up", label: "Upcoming", href: "?tab=up" }, { id: "past", label: "Past", href: "?tab=past" }]} />), /data-next=""/u);
  // DayStrip called its link as a function in 0.2.0: an exotic component threw.
  const strip = html(<DayStrip days={["2026-09-29", "2026-09-30"]} current="2026-09-30" today="2026-09-29" href={d => `/chest?day=${d}`} link={Link} labels={fr.date} />);
  assert.match(strip, /data-next=""/u);
  assert.match(strip, /href="\/chest\?day=2026-09-30"/u);
  assert.match(strip, /aria-current="date"/u);
  assert.match(html(<Filters path="/chest" params="" link={Link} groups={[{ key: "f", label: "Kit", options: [{ value: "screen", label: "Screen" }] }]} />), /data-next=""/u);
  assert.match(html(<LanguageSwitch languages={storeLanguages} current="en" label="Language" link={Link} />), /data-next=""/u);
  // A 0.2.0 link — a function returning an element — still fits.
  const old: (props: { href: string; className?: string; "aria-current"?: "page" | "true"; hrefLang?: string; lang?: string; children: ReactNode }) => ReactElement = ({ children, ...p }) => <a data-old="" {...p}>{children}</a>;
  assert.match(html(<Nav items={nav} path="/chest" label="Sections" link={old} />), /data-old=""/u);
  assert.match(html(<DayStrip days={["2026-09-29"]} current={null} today="2026-09-29" href={d => `/d/${d}`} link={({ children, ...p }) => <a data-old="" {...p}>{children}</a>} labels={en.date} />), /data-old=""/u);
});

test("NavItem: `also` makes a section current on other paths; `match` exact or prefix; /chest exact by default", () => {
  const nav: NavItem[] = [
    { href: "/chest", label: "Bookings", also: ["/chest/new", "/chest/b"] },
    { href: "/chest/types", label: "Types", match: "exact" },
    { href: "/chest/settings", label: "Settings" },
  ];
  const current = (path: string) => [...html(<Nav items={nav} path={path} label="Sections" />).matchAll(/<a href="([^"]+)" class="ck-nav-link" aria-current="page">/gu)].map(m => m[1]);
  assert.deepEqual(current("/chest"), ["/chest"]);
  assert.deepEqual(current("/chest/new"), ["/chest"]);
  assert.deepEqual(current("/chest/b/42"), ["/chest"]);
  assert.deepEqual(current("/chest/types"), ["/chest/types"]);
  assert.deepEqual(current("/chest/types/3"), [], "exact: not on its sub-pages");
  assert.deepEqual(current("/chest/settings/team"), ["/chest/settings"]);
  assert.deepEqual(current("/chest/other"), [], "/chest stays exact");
  const home = html(<Nav items={[{ href: "/chest", label: "Home", match: "prefix" }]} path="/chest/x" label="Sections" />);
  assert.match(home, /aria-current="page"/u, "match prefix makes /chest current on its sub-pages");
  assert.match(html(<NavLink href="/chest" path="/chest/new" also={["/chest/new"]}>Bookings</NavLink>), /aria-current="page"/u);
  assert.ok(!html(<Nav items={[{ href: "/chest/a", label: "A", exact: true }]} path="/chest/a/1" label="S" />).includes("aria-current"), "exact (0.2.0) still works");
});

test("Filters: a group with several values (f=screen,dock), counts, All and Clear", () => {
  const groups = [{ key: "f", label: "Equipment", all: true, multiple: true, options: [{ value: "screen", label: "Screen", count: 4 }, { value: "dock", label: "Dock", count: 2 }, { value: "wifi", label: "Wi-Fi", count: 0 }] }];
  const two = html(<Filters path="/chest" params="f=screen,dock&q=big" labels={en.filters} groups={groups} />);
  assert.match(two, /href="\/chest\?f=dock&amp;q=big" class="ck-filter-chip" aria-current="true"><span>Screen<\/span><span class="ck-count">4<\/span>/u, "Screen is on; its chip takes it away");
  assert.match(two, /href="\/chest\?f=screen&amp;q=big" class="ck-filter-chip" aria-current="true"><span>Dock<\/span><span class="ck-count">2<\/span>/u);
  assert.match(two, /href="\/chest\?f=screen%2Cdock%2Cwifi&amp;q=big" class="ck-filter-chip"><span>Wi-Fi<\/span>/u, "Wi-Fi adds itself");
  assert.match(two, /href="\/chest\?q=big" class="ck-filter-chip">All</u, "All is not current while values are chosen");
  assert.match(two, /href="\/chest\?q=big" class="ck-filter-clear">Clear filters</u);
  const none = html(<Filters path="/chest" params="" labels={en.filters} groups={groups} />);
  assert.match(none, /href="\/chest" class="ck-filter-chip" aria-current="true">All</u);
  assert.ok(!none.includes("ck-filter-clear"));
});

test("SearchBox: maxLength, 200 by default, and a longer address value cut to it", () => {
  assert.match(html(<SearchBox action="/chest" labels={en.search} />), /maxLength="200"/u);
  const short = html(<SearchBox action="/chest" labels={en.search} maxLength={20} value={"x".repeat(50)} />);
  assert.match(short, /maxLength="20"/u);
  assert.match(short, new RegExp(`value="${"x".repeat(20)}"`, "u"));
});

test("PageHeader: size l by default (--text-2xl), m (--text-xl)", () => {
  assert.match(html(<PageHeader title="Rooms" />), /^<div class="ck-page-head"><div class="ck-page-title"><h1>Rooms<\/h1>/u);
  assert.match(html(<PageHeader title="New booking" size="m" />), /^<div class="ck-page-head ck-page-head-m">/u);
  const css = readFileSync(join(ui, "css", "components.css"), "utf8");
  assert.match(css, /\.ck-page-head-m \.ck-page-title h1, \.ck-page-head-m \.ck-page-title h2 \{ font-size: var\(--text-xl\); \}/u);
});

test("DateField: the line of the date in words is always there, empty or not, and keeps its height", () => {
  const empty = html(<DateField label="Day" value={null} onChange={noop} today="2026-09-29" labels={en.date} />);
  assert.match(empty, /<p id="[^"]+" class="ck-hint ck-date-read"><\/p>/u);
  const css = readFileSync(join(ui, "css", "components.css"), "utf8");
  assert.match(css, /\.ck-date-read, \.ck-date-read:empty \{ display: block; min-height: calc\(var\(--text-s\) \* var\(--leading\)\);/u, "an empty line is not display: none");
});

test("AvatarStack: no overlap at size s; the others overlap less than the initials' margin", () => {
  const css = readFileSync(join(ui, "css", "components.css"), "utf8");
  assert.match(css, /\.ck-stack-s > \.ck-avatar \+ \.ck-avatar \{ margin-left: 0; \}/u);
  // The browser check (check-page.mjs) measures the letters of every stack
  // in every look; here the overlaps stay within what it measured.
  for (const [size, max] of [["", 2], ["-l", 4], ["-xl", 8]] as const) {
    const m = new RegExp(`\\.ck-stack${size} > \\.ck-avatar \\+ \\.ck-avatar \\{ margin-left: -(\\d+)px; \\}`, "u").exec(css);
    assert.ok(m && Number(m[1]) <= max, `stack${size} overlap ≤ ${max}px`);
  }
});

test("the categorical palette keeps its families in every theme but Chest's greys (Workshop's labels were black)", async () => {
  const { catalogue } = await import("../src/themes.js");
  const { checkPalette, checkTheme, categoryFamilies } = await import("../src/contract.js");
  const { oklch, hueDistance } = await import("../src/color.js");
  for (const theme of catalogue) {
    assert.deepEqual(checkTheme(theme), [], `${theme.id}: AA still`);
    if (theme.id === "chest") assert.ok(checkPalette(theme).length > 0, "Chest: greys by design");
    else assert.deepEqual(checkPalette(theme), [], theme.id);
  }
  const workshop = catalogue.find(t => t.id === "workshop")!;
  const ink = oklch(workshop.light["cat-3-ink"])!;
  assert.ok(ink.c >= 0.05 && hueDistance(ink.h, categoryFamilies[2]!.hue) <= 35, `Workshop's slot 3 label is an orange, not black (${workshop.light["cat-3-ink"]})`);
  // The check itself: black and a red in the pink slot are refused.
  const broken = { light: { ...workshop.light, "cat-3-ink": "#151515", "cat-5": "#c42d17" }, dark: workshop.dark };
  assert.deepEqual(checkPalette(broken).map(f => `${f.token} ${f.why}`), ["cat-3-ink reads grey or black, not orange", "cat-5 hue out of the pink family"]);
});

test("each identity keeps its tool's signature colour (the tools' tokens.css before migration, commit f703465)", async () => {
  const { themeOf } = await import("../src/themes.js");
  const signatures: [theme: string, mode: "light" | "dark", token: string, value: string, what: string][] = [
    ["instrument", "light", "highlight", "#c6ff3a", "Timesheets' electric lime signal (was #e4f9b0 in 0.2.0)"],
    ["instrument", "light", "accent", "#0f5b43", "Timesheets' ink green"],
    ["workshop", "light", "accent", "#ffd84d", "Tasks' sun yellow"],
    ["workshop", "light", "cat-3-soft", "#ff7a59", "Tasks' tomato label"],
    ["library", "light", "highlight", "#f6e3a1", "Wiki's marker"],
    ["library", "dark", "highlight", "#5c4a14", "Wiki's marker, dark"],
    ["newsprint", "light", "accent", "#c4121a", "News' red"],
    ["newsprint", "light", "highlight", "#f2e3b8", "News' highlight"],
    ["seaside", "light", "accent", "#2366a8", "Leave's sea blue"],
    ["gallery", "light", "accent", "#b4472a", "People's terracotta"],
    ["sales-desk", "light", "accent", "#2152ff", "Clients' blue"],
    ["counter", "light", "accent", "#0b6e69", "Support's teal"],
    ["receipt", "light", "accent", "#0b7a43", "Expenses' money green"],
    ["blueprint", "light", "cat-3", "#c2410c", "Rooms' signal orange"],
    ["appointment", "light", "accent", "#5b2a86", "Booking's plum"],
    ["magazine", "light", "cat-3", "#c93a1e", "Hiring's tomato"],
    ["labels", "light", "accent", "#c2410c", "Equipment's orange"],
    ["confetti", "light", "accent", "#ff7a63", "Polls' coral"],
    ["trail", "light", "cat-3", "#bf4f1d", "Goals' sunrise"],
    ["trail", "light", "highlight", "#f6dfcd", "Goals' sunrise soft"],
    ["letterpress", "light", "accent", "#8a1f30", "Quotes' oxblood"],
    ["control-room", "light", "accent", "#0f1419", "Status' ink"],
  ];
  for (const [id, mode, token, value, what] of signatures) assert.equal((themeOf(id)!)[mode][token as "accent"], value, `${id} ${mode} --${token}: ${what}`);
});

test("BrandMark: the logo variant follows its ground (page, inverse, dark, light)", async () => {
  const { BrandMark } = await import("../src/components/index.js");
  const logo = { url: "/_chest/theme/brand/logo.svg", alt: "Atelier Martin", dark: "/_chest/theme/brand/logo-dark.svg" };
  assert.equal(html(<BrandMark logo={logo} />), '<picture class="ck-logo"><source srcSet="/_chest/theme/brand/logo-dark.svg" media="(prefers-color-scheme: dark)"/><img src="/_chest/theme/brand/logo.svg" alt="Atelier Martin"/></picture>', "0.2.0's output, unchanged");
  assert.equal(html(<BrandMark logo={logo} ground="inverse" />), '<picture class="ck-logo"><source srcSet="/_chest/theme/brand/logo.svg" media="(prefers-color-scheme: dark)"/><img src="/_chest/theme/brand/logo-dark.svg" alt="Atelier Martin"/></picture>', "a dark header in a light look: the dark variant; the light one in a dark look");
  assert.equal(html(<BrandMark logo={logo} ground="dark" />), '<picture class="ck-logo"><img src="/_chest/theme/brand/logo-dark.svg" alt="Atelier Martin"/></picture>');
  assert.equal(html(<BrandMark logo={logo} ground="light" />), '<picture class="ck-logo"><img src="/_chest/theme/brand/logo.svg" alt="Atelier Martin"/></picture>');
  assert.equal(html(<BrandMark logo={{ url: "/l.svg", alt: "A" }} ground="inverse" />), '<picture class="ck-logo"><img src="/l.svg" alt="A"/></picture>', "no dark variant: the one logo");
});

test("a toast's own action (Keep 1 min): the longer time, gone after Undo, never on a toast without a label", async () => {
  const { toastReducer, durations } = await import("../src/components/toast-state.js");
  const run = () => {};
  const [t] = toastReducer([], { type: "show", input: { id: "timer", text: "Timer stopped.", action: { label: "Keep 1 min", run } }, now: 0, seq: 1 });
  assert.equal(t!.action?.label, "Keep 1 min");
  assert.equal(t!.deadline, durations.withUndo, "a button to reach: 10 s");
  const sent = toastReducer([], { type: "show", input: { text: "Sent.", sent: true, undo: () => true, action: { label: "Open", run } }, now: 0, seq: 2 })[0]!;
  assert.equal(sent.undo, null, "sent: never Undo");
  assert.equal(sent.action?.label, "Open", "but another action may stay");
  const both = toastReducer([], { type: "show", input: { id: "x", text: "Moved.", undo: () => true, action: { label: "Open", run } }, now: 0, seq: 3 });
  const undoing = toastReducer(both, { type: "undoStart", id: "x" });
  const undone = toastReducer(undoing, { type: "undoEnd", id: "x", ok: true, note: null, now: 1 });
  assert.equal(undone[0]!.action, null, "after Undo the action is gone");
  assert.equal(toastReducer([], { type: "show", input: { text: "x", action: { label: " ", run } }, now: 0, seq: 4 })[0]!.action, null);
  assert.equal(toastReducer([], { type: "show", input: { text: "Plain." }, now: 0, seq: 5 })[0]!.deadline, durations.info, "0.2.0's toasts unchanged");
});

test("Segmented: disabled as a whole or per option; the radio never covers the word", async () => {
  const { Segmented } = await import("../src/components/index.js");
  const all = html(<Segmented label="View" value="a" onChange={noop} disabled options={[{ value: "a", label: "A" }, { value: "b", label: "B" }]} />);
  assert.match(all, /<fieldset class="ck-segmented" disabled="">/u);
  const one = html(<Segmented label="When" value="a" onChange={noop} options={[{ value: "a", label: "Morning" }, { value: "b", label: "Afternoon", disabled: true }]} />);
  assert.match(one, /<fieldset class="ck-segmented">/u);
  assert.match(one, /<input type="radio" disabled="" name="[^"]+" value="b"\/>/u);
  const css = readFileSync(join(ui, "css", "components.css"), "utf8");
  const rule = /\.ck-segment input \{([^}]*)\}/u.exec(css)![1]!;
  assert.ok(!rule.includes("inset: 0") && rule.includes("pointer-events: none") && rule.includes("width: 1px"), "the input is 1 px, out of the pointer's way");
});

test("FilePicker: one file says 'drop it here' (le), several 'drop them' (les)", async () => {
  const { FilePicker } = await import("../src/components/index.js");
  assert.match(html(<FilePicker label="CV" files={[]} onChange={noop} maxFiles={1} labels={fr.files} />), /ou déposez-le ici/u);
  assert.match(html(<FilePicker label="CV" files={[]} onChange={noop} maxFiles={1} labels={en.files} />), /or drop it here/u);
  assert.match(html(<FilePicker label="Receipts" files={[]} onChange={noop} maxFiles={4} labels={fr.files} />), /ou déposez-les ici/u);
  const { dropOne: _, ...older } = en.files; // a 0.2.0 catalogue, without dropOne
  assert.match(html(<FilePicker label="CV" files={[]} onChange={noop} maxFiles={1} labels={older} />), /or drop them here/u);
});

test("Filters: a required group — no All, no let-go, not cleared; its default is current", () => {
  const groups = [
    { key: "period", label: "Period", required: true, all: true, value: "week", options: [{ value: "week", label: "Week" }, { value: "month", label: "Month" }] },
    { key: "state", label: "State", options: [{ value: "late", label: "Late", count: 2 }] },
  ];
  const plain = html(<Filters path="/chest" params="" labels={en.filters} groups={groups} />);
  assert.ok(!plain.includes(">All<"), "no All in a required group");
  assert.match(plain, /href="\/chest\?period=week" class="ck-filter-chip" aria-current="true"><span>Week/u, "its default is current, and choosing it keeps it");
  assert.ok(!plain.includes("ck-filter-clear"), "a required group is not a filter to clear");
  const chosen = html(<Filters path="/chest" params="period=month&state=late" labels={en.filters} groups={groups} />);
  assert.match(chosen, /href="\/chest\?period=month&amp;state=late" class="ck-filter-chip" aria-current="true"><span>Month/u, "a second tap keeps it");
  assert.match(chosen, /href="\/chest\?period=month" class="ck-filter-clear">Clear filters</u, "Clear leaves the required group");
});

test("a sortable header's button inherits the header's typography", () => {
  const css = readFileSync(join(ui, "css", "components.css"), "utf8");
  const rule = /\.ck-sort \{([^}]*)\}/u.exec(css)![1]!;
  for (const p of ["font: inherit", "font-variant: inherit", "letter-spacing: inherit", "text-transform: inherit"]) assert.ok(rule.includes(p), p);
});

test("TimeSelect: an optional time with `empty` (value \"\" / null); 0.2.0's calls unchanged", async () => {
  const { TimeSelect } = await import("../src/components/index.js");
  const { moveStart } = await import("../src/components/time.js");
  const slot = { start: 540, end: 600 };
  let got: number | null = -1;
  // Types: without `empty` onChange gets a number (moveStart takes one); with it, number | null.
  const plain = html(<TimeSelect id="s" value={slot.start} onChange={s => { const moved: { start: number; end: number } = moveStart(slot, s); void moved; }} step={60} />);
  assert.ok(!plain.includes('<option value="">'));
  assert.match(plain, /<option value="540" selected="">09:00<\/option>/u);
  const optional = html(<TimeSelect id="b" empty="No break" value={null} onChange={m => { got = m; }} step={60} />);
  assert.match(optional, /<select[^>]*><option value="" selected="">No break<\/option><option value="0">00:00<\/option>/u);
  assert.match(html(<TimeSelect id="b" empty="—" value={600} onChange={m => { got = m; }} step={60} />), /<option value="600" selected="">10:00<\/option>/u);
  assert.match(html(<TimeSelect id="b" name="brk" empty="—" defaultValue={null} step={60} />), /<option value="" selected="">—<\/option>/u);
  assert.equal(got, -1);
});

test("dateWords: a catalogue's date words (order a string, weekStart a number) become DateWords, checked", () => {
  const loose = JSON.parse(JSON.stringify(fr.date)) as { order: string; weekStart: number } & Omit<typeof fr.date, "order" | "weekStart">;
  return import("../src/components/words.js").then(({ dateWords }) => {
    const words = dateWords(loose);
    assert.deepEqual(words, fr.date);
    assert.equal(dateWords({ ...fr.date, today: "Ce jour" }).today, "Ce jour");
    assert.throws(() => dateWords({ ...loose, order: "ydm" }), /order is "dmy", "mdy" or "ymd"/u);
    assert.throws(() => dateWords({ ...loose, weekStart: 2 }), /weekStart is 0/u);
    assert.throws(() => dateWords({ ...loose, months: loose.months.slice(1) }), /months holds 12 names/u);
    // What it gives goes where DateWords goes.
    assert.match(html(<DateField label="Jour" value="2026-09-29" onChange={noop} today="2026-09-29" labels={dateWords(loose)} />), /mardi 29 septembre 2026/u);
  });
});

test("SearchBox autoFocus; PeoplePicker words for suggestions; the logo's cap; a full FilePicker stays readable", async () => {
  const { PeoplePicker } = await import("../src/components/index.js");
  const { localSearch } = await import("../src/components/people.js");
  // React focuses on mount (no attribute in the server's HTML): the prop is typed and accepted.
  assert.match(html(<SearchBox action="/chest/search" autoFocus labels={en.search} />), /role="search"/u);
  assert.equal(en.peoplePicker.suggested, "Suggested");
  assert.equal(fr.peoplePicker.suggested, "Suggestions");
  assert.match(html(<PeoplePicker label="Owner" search={localSearch([])} value={[]} onChange={noop} suggestions={[]} suggestionsLabel="Your team" labels={en.peoplePicker} />), /role="combobox"/u);
  const css = readFileSync(join(ui, "css", "components.css"), "utf8");
  assert.match(css, /\.ck-logo img \{[^}]*max-width: min\(var\(--ck-logo-max, 160px\), 33vw\); object-fit: contain;/u);
  assert.ok(!/\.ck-drop\.ck-disabled \{ opacity/u.test(css), "the zone is not dimmed as a whole");
  assert.match(css, /\.ck-drop\.ck-disabled \.ck-button \{[^}]*opacity/u);
  assert.match(css, /\.ck-drop\.ck-disabled \.ck-drop-hint \{ display: none; \}/u);
});

test("PeoplePicker hideLabel: labelled for screen readers only (a table cell)", async () => {
  const { PeoplePicker } = await import("../src/components/index.js");
  const { localSearch } = await import("../src/components/people.js");
  const cell = html(<PeoplePicker label="Replacement" hideLabel search={localSearch([])} value={[]} onChange={noop} labels={en.peoplePicker} />);
  assert.match(cell, /<label class="ck-vh" for="[^"]+">Replacement<\/label>/u);
  assert.match(html(<PeoplePicker label="Owner" search={localSearch([])} value={[]} onChange={noop} labels={en.peoplePicker} />), /<label class="ck-label"/u);
});

test("MonthField: a month in words, the previous and the next one tap away, in the tool's language", async () => {
  const { MonthField } = await import("../src/components/index.js");
  const { addYearMonths, isYearMonth, monthsFrom } = await import("../src/components/dates.js");
  assert.equal(addYearMonths("2026-11", 3), "2027-02");
  assert.equal(addYearMonths("2026-01", -1), "2025-12");
  assert.deepEqual(monthsFrom("2026-11", "2027-02"), ["2026-11", "2026-12", "2027-01", "2027-02"]);
  assert.ok(isYearMonth("2026-09") && !isYearMonth("2026-13") && !isYearMonth("2026-9"));
  const fr1 = html(<MonthField label="Mois" value="2026-09" onChange={noop} today="2026-09-29" min="2026-01" max="2026-12" labels={fr.date} />);
  assert.match(fr1, /<option value="2026-09" selected="">Septembre 2026<\/option>/u);
  assert.equal((fr1.match(/<option /gu) ?? []).length, 12);
  assert.match(fr1, /Mois précédent/u);
  const edge = html(<MonthField label="Month" value="2026-01" onChange={noop} today="2026-09-29" min="2026-01" labels={en.date} />);
  assert.match(edge, /<button type="button" class="ck-icon-button" disabled=""><svg[^]*?Previous month/u, "no month before min");
  const outside = html(<MonthField label="Month" value="2019-03" onChange={noop} today="2026-09-29" labels={en.date} />);
  assert.match(outside, /<option value="2019-03" selected="">March 2019<\/option>/u, "a value outside the range is kept and shown");
  assert.equal(html(<MonthField label="Month" value="2026-09" onChange={noop} today="2026-09-29" labels={en.date} />), html(<MonthField label="Month" value="2026-09" onChange={noop} today="2026-09-29" labels={en.date} />), "no clock: the same on server and browser");
});

test("initials: a trailing note in brackets is not part of the name", async () => {
  const { initials } = await import("../src/components/text.js");
  assert.equal(initials("Léa Dubois (former member)"), "LD");
  assert.equal(initials("Léa Dubois (ancienne)"), "LD");
  assert.equal(initials("Hugo Bernard [external]"), "HB");
  assert.equal(initials("Camille Martin"), "CM");
  assert.equal(initials("(bot)"), "B", "a name that is only a note keeps its letter");
  assert.equal(initials("Tom"), "T");
});

test("DataTable rowProps: a row's class and data- attributes, nothing else", async () => {
  const { DataTable } = await import("../src/components/index.js");
  type R = { id: string; past: boolean };
  const markup = html(<DataTable<R> caption="Bookings" columns={[{ key: "id", label: "#", value: r => r.id, rowHeader: true }]} rows={[{ id: "b1", past: true }, { id: "b2", past: false }]} rowKey={r => r.id}
    rowProps={r => ({ className: r.past ? "is-past" : undefined, "data-state": r.past ? "past" : "coming", ...({ onClick: noop, style: "color:red" } as object) })} />);
  assert.match(markup, /<tr data-state="past" class="is-past">/u);
  assert.match(markup, /<tr data-state="coming">/u);
  assert.ok(!markup.includes("style=") && !markup.includes("onClick"), "only class and data-");
});

test("no color-mix in OKLCH in the kit's CSS and docs (a white has no hue: Chrome swings the mix)", () => {
  for (const file of ["css/components.css", "tokens/CONTRACT.md", "README.md", "AGENTS.md"]) {
    const text = readFileSync(join(ui, file), "utf8");
    const uses = [...text.matchAll(/color-mix\(in oklch[^)]*\)/gu)].map(m => m[0]).filter(u => !u.includes("#2b59c3"));
    assert.deepEqual(uses, [], file);
  }
});
