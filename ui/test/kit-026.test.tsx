// What 0.2.6 fixes, from the store's third critique (tools had to work
// around them). What needs a browser is also played in Chromium, and fails
// on 0.2.5: the day in words under a refused date, the day strip's one Tab
// stop, toasts that go by themselves and sit above a phone's bottom bar
// (scripts/gallery/check-flows.mjs), five French sections on one line in
// every look and both harness brands (scripts/gallery/check-page.mjs).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DateField, DayStrip, Menu, type DayStripLinkProps } from "../src/components/index.js";
import { stripKey } from "../src/components/keys.js";
import { bottomBarLift, bottomBarProperty, byKeyboard, toastReducer, type ToastState } from "../src/components/toast-state.js";
import { en, fr } from "../src/components/words.js";
import * as logic from "../src/components/logic.js";
import { checkTheme } from "../src/contract.js";
import { themeOf } from "../src/themes.js";

const ui = join(import.meta.dirname, "..", "..");
const css = readFileSync(join(ui, "css", "components.css"), "utf8").replace(/\/\*[\s\S]*?\*\//gu, "");
const phone = css.slice(css.indexOf("@media (max-width: 760px)"));
const source = (file: string) => readFileSync(join(ui, "src", "components", file), "utf8");
const html = (el: ReactElement) => renderToStaticMarkup(el);
const noop = () => {};
const days = ["2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02"];

// ---------- 1. DateField: no day in words under a refused text (Leave) ----------

test("DateField: while a refused text stands, the last accepted day is not written under it; its sentence takes that line", () => {
  // Without a problem, as before: the day in words, read with the field.
  const out = html(<DateField label="Back on" value="2026-09-30" onChange={noop} today="2026-09-29" labels={en.date} />);
  const read = /<p id="([^"]+)" class="ck-hint ck-date-read">Tomorrow · Wednesday 30 September 2026<\/p>/u.exec(out);
  assert.ok(read, "the day in words");
  assert.ok(/aria-describedby="([^"]+)"/u.exec(out)![1]!.split(" ").includes(read[1]!));
  // A problem is a state the server never renders (it comes from typing):
  // the rule is in the render, checked in the source and played by check-flows.
  const field = source("date-field.tsx");
  assert.match(field, /const read = value && problem === null \?/u, "no day in words while a problem stands");
  assert.match(field, /const readShown = problem === null \|\| quiet;/u, "the line is kept (empty) while the sentence is quiet: leaving the field moves nothing");
  assert.match(field, /\{readShown && <p id=\{readId\}/u, "the sentence takes the line's place");
  assert.match(field, /readShown \? readId : null/u, "a line not shown is not read");
  assert.match(css, /\.ck-date > \.ck-error \{ line-height: var\(--leading\); \}/u, "the sentence has the line's measure");
  assert.match(css, /\.ck-date-read, \.ck-date-read:empty \{[^}]*min-height: calc\(var\(--text-s\) \* var\(--leading\)\);/u);
});

// ---------- 2. DayStrip: one Tab stop (Rooms: 27 before its first desk) ----------

test("stripKey: Left/Right a day, stopping at the ends; Home/End; other keys are not the strip's", () => {
  assert.equal(stripKey(0, 10, "ArrowRight"), 1);
  assert.equal(stripKey(9, 10, "ArrowRight"), 9, "no wrapping past the last day");
  assert.equal(stripKey(0, 10, "ArrowLeft"), 0);
  assert.equal(stripKey(5, 10, "ArrowLeft"), 4);
  assert.equal(stripKey(5, 10, "Home"), 0);
  assert.equal(stripKey(5, 10, "End"), 9);
  for (const key of ["ArrowUp", "ArrowDown", "Enter", " ", "Tab", "a"]) assert.equal(stripKey(5, 10, key), null, key);
  assert.equal(stripKey(0, 0, "ArrowRight"), null);
  assert.equal(logic.stripKey, stripKey, "in /components/logic");
});

test("DayStrip with buttons: a listbox of options, one Tab stop — the chosen day, else today, else the first", () => {
  const tabs = (markup: string) => [...markup.matchAll(/<button[^>]*>/gu)].map(m => /tabindex="(-?\d)"/u.exec(m[0])?.[1]);
  const chosen = html(<DayStrip days={days} current="2026-10-01" today="2026-09-29" onPick={noop} labels={fr.date} label="Jour" />);
  assert.match(chosen, /<ul role="listbox" aria-label="Jour" aria-orientation="horizontal">/u);
  assert.equal((chosen.match(/<li role="none">/gu) ?? []).length, 4);
  assert.equal((chosen.match(/role="option"/gu) ?? []).length, 4);
  assert.deepEqual(tabs(chosen), ["-1", "-1", "0", "-1"], "the chosen day is the only Tab stop");
  assert.match(chosen, /aria-selected="true" aria-label="jeudi 1 octobre 2026"/u);
  assert.equal((chosen.match(/aria-selected="false"/gu) ?? []).length, 3);
  assert.doesNotMatch(chosen, /aria-pressed|<nav/u, "not toggle buttons in a navigation");
  assert.deepEqual(tabs(html(<DayStrip days={days} current={null} today="2026-09-30" onPick={noop} labels={en.date} />)), ["-1", "0", "-1", "-1"], "nothing chosen: today");
  assert.deepEqual(tabs(html(<DayStrip days={days.slice(2)} current={null} today="2026-09-29" onPick={noop} labels={en.date} />)), ["0", "-1"], "nor today: the first day");
  assert.match(css, /\.ck-daytile\[aria-current="date"\], \.ck-daytile\[aria-pressed="true"\], \.ck-daytile\[aria-selected="true"\] \{/u, "a chosen option looks chosen");
  assert.match(css, /\.ck-daystrip nav, \.ck-daystrip-row \{[^}]*overflow-x: auto;/u, "the row still scrolls sideways");
});

test("DayStrip with links (Rooms): links in a navigation, every one a Tab stop until the script runs, the tool's link given tabIndex", () => {
  const markup = html(<DayStrip days={days} current="2026-09-30" today="2026-09-29" href={d => `/chest?day=${d}`} labels={en.date} />);
  assert.match(markup, /<nav aria-label="Choose a day"><ul>/u);
  assert.equal((markup.match(/<a /gu) ?? []).length, 4);
  assert.doesNotMatch(markup, /tabindex|role="option"/u, "without script, a plain list of links");
  assert.match(markup, /href="\/chest\?day=2026-09-30" class="ck-daytile" aria-current="date"/u);
  // A tool's wrapper takes the props it is given (Rooms: `props => <Link {...props} scroll={false} />`).
  const seen: DayStripLinkProps[] = [];
  const link = (props: DayStripLinkProps): ReactNode => { seen.push(props); return <a {...props} />; };
  html(<DayStrip days={days} current="2026-09-30" today="2026-09-29" href={d => `/r/${d}`} link={link} labels={en.date} />);
  assert.equal(seen.length, 4);
  assert.deepEqual(Object.keys(seen[1]!).sort(), ["aria-current", "aria-label", "children", "className", "href"]);
  // The keyboard rule, in the source: arrows move the focus, Space follows a link, one Tab stop once hydrated.
  const strip = source("day-strip.tsx");
  assert.match(strip, /const roving = ready \|\| !href;/u);
  assert.match(strip, /all\[at\]!\.click\(\);/u, "Space follows the link");
  assert.match(strip, /stripKey\(at, all\.length, e\.key\)/u);
  assert.match(strip, /tiles\(\)\[at\]\?\.focus\(\);/u, "focus put back on the Tab stop when an inline link component redrew the tiles");
});

// ---------- 3. Toasts: gone by themselves, above a phone's bottom bar (Quotes) ----------

const base = (over: Partial<ToastState> = {}): ToastState[] => toastReducer([], { type: "show", input: { id: "a", text: "Line deleted.", undo: () => true }, now: 0, seq: 1 }).map(t => ({ ...t, ...over }));

test("toast: an Undo that ends lets the pointer that pressed it go (the toast shrank from under it and was never told it left)", () => {
  let s = base();
  s = toastReducer(s, { type: "hover", id: "a", on: true, now: 1000 });
  assert.equal(s[0]!.deadline, null, "pointed at: it waits");
  s = toastReducer(s, { type: "undoStart", id: "a" });
  s = toastReducer(s, { type: "undoEnd", id: "a", ok: true, note: null, now: 2000 });
  assert.equal(s[0]!.hover, false);
  assert.equal(s[0]!.deadline, 6000, "Undone. goes in its 4 s");
  assert.equal(toastReducer(s, { type: "expire", id: "a", now: 6000 }).length, 0);
  // The keyboard in it still holds it (WCAG 2.2.1).
  let k = base();
  k = toastReducer(k, { type: "focus", id: "a", on: true, now: 1000 });
  k = toastReducer(k, { type: "undoStart", id: "a" });
  k = toastReducer(k, { type: "undoEnd", id: "a", ok: true, note: null, now: 2000 });
  assert.equal(k[0]!.deadline, null, "the keyboard's focus holds it");
  k = toastReducer(k, { type: "focus", id: "a", on: false, now: 9000 });
  assert.equal(k[0]!.deadline, 15_000, "and it gets 6 s once the keyboard leaves");
});

test("toast: only the keyboard's focus holds it (a click's or a tap's does not), and only a mouse that moves on it", () => {
  const el = (visible: boolean | "throws") => ({ matches: (q: string) => { assert.equal(q, ":focus-visible"); if (visible === "throws") throw new SyntaxError(q); return visible; } });
  assert.equal(byKeyboard(el(true)), true);
  assert.equal(byKeyboard(el(false)), false, "a clicked button");
  assert.equal(byKeyboard(el("throws")), true, "a browser that cannot tell: counted as the keyboard");
  assert.equal(byKeyboard(null), false);
  assert.equal(byKeyboard({}), false);
  const toast = source("toast.tsx");
  assert.doesNotMatch(toast, /onMouseEnter|onMouseLeave/u, "no hover from a pointer that did not move (a toast appearing under it)");
  assert.match(toast, /onPointerMove=\{e => \{ if \(e\.pointerType === "mouse" && !toast\.hover\)/u, "a mouse that moves on it");
  assert.match(toast, /onFocus=\{e => \{ if \(byKeyboard\(e\.target\)\)/u);
  assert.match(toast, /document\.addEventListener\("pointermove", onMove/u, "a pointer moving elsewhere lets it go");
  assert.match(toast, /byKeyboard\(active\)\) box\.querySelector<HTMLElement>\("\.ck-toast-close"\)\?\.focus\(\)/u, "the close button gets the focus after a keyboard's Undo only");
});

test("toast: bottomBarLift rises above a bar marked data-ck-bottom-bar that touches the screen's bottom", () => {
  const page = (...boxes: { top: number; bottom: number; width?: number; height?: number }[]) => ({
    querySelectorAll: (q: string) => { assert.equal(q, "[data-ck-bottom-bar]"); return boxes.map(b => ({ getBoundingClientRect: () => ({ width: 390, height: b.bottom - b.top, ...b }) })); },
  });
  assert.equal(bottomBarLift(page(), 800), 0, "no bar");
  assert.equal(bottomBarLift(page({ top: 728, bottom: 800 }), 800), 72);
  assert.equal(bottomBarLift(page({ top: 727.4, bottom: 800 }), 800), 73, "whole pixels, never under the bar");
  assert.equal(bottomBarLift(page({ top: 728, bottom: 834 }), 800), 72, "a bar reaching past the edge (safe area)");
  assert.equal(bottomBarLift(page({ top: 600, bottom: 672 }), 800), 0, "a bar not at the bottom (scrolled with the page)");
  assert.equal(bottomBarLift(page({ top: 728, bottom: 800, width: 0 }), 800), 0, "a bar hidden on this screen");
  assert.equal(bottomBarLift(page({ top: 728, bottom: 800 }, { top: 700, bottom: 800 }), 800), 100, "the highest");
  assert.equal(bottomBarProperty, "--ck-bottom-bar");
  assert.match(css, /\.ck-toasts \{[^}]*bottom: calc\(max\(var\(--space-4\), env\(safe-area-inset-bottom\)\) \+ var\(--ck-bottom-bar, 0px\)\);/u);
});

// ---------- 4. The Chest look: headings a step up, a light "More" in the header (Quotes) ----------

test("Chest theme: a page's heading is a step up from the body (20 / 28 / 40 px), every pair still measured", () => {
  const chest = themeOf("chest")!;
  assert.equal(chest.type.m, 0.9375, "the body stays 15 px");
  assert.ok(chest.type.l >= 1.25, `--text-l ${chest.type.l}: a phone's page title (size m) was 17 px`);
  assert.ok(chest.type.xl >= 1.75 && chest.type.xxl >= 2.5);
  assert.ok(chest.type.xs < chest.type.s && chest.type.s < chest.type.m && chest.type.m < chest.type.l && chest.type.l < chest.type.xl && chest.type.xl < chest.type.xxl);
  assert.deepEqual(checkTheme(chest), [], "WCAG AA: every pair of the contract");
  assert.match(phone, /\.ck-page-head-m \.ck-page-title h1, \.ck-page-head-m \.ck-page-title h2 \{ font-size: var\(--text-l\); \}/u);
});

test("Menu in the header: its shown label is a word beside the sections, not a box — the same button, 44 px", () => {
  assert.match(css, /\.ck-bar \.ck-menu > \.ck-button-quiet \{ border-color: transparent; background: none; color: var\(--ink-2\); \}/u, "no edge, no ground; --ink-2 on --surface (measured)");
  assert.match(css, /\.ck-bar \.ck-menu > \.ck-button-quiet:hover, \.ck-bar \.ck-menu > \.ck-button-quiet\[aria-expanded="true"\] \{ background: var\(--surface-2\); color: var\(--ink\); \}/u);
  const out = html(<Menu label="More" showLabel items={[{ label: "Export", onSelect: noop }]} />);
  assert.match(out, /class="ck-button ck-button-quiet ck-button-small"/u, "the markup of 0.2.5: a tool's CSS still applies");
  assert.match(css, /\.ck-button-small \{ min-height: var\(--control-h\);/u);
});

// ---------- 5. Phone navigation: five French names on one line (Timesheets, brand look) ----------

test("phone navigation: each tab takes its name's width and shares the rest; a long name still wraps at its space, never cut", () => {
  assert.match(phone, /\.ck-nav ul \{ display: flex; width: 100%; gap: 0; overflow-x: auto;/u);
  assert.match(phone, /\.ck-nav li \{ display: block; flex: 1 1 auto; \}/u, "the name's width, then an equal share");
  assert.doesNotMatch(phone, /grid-auto-columns: minmax\(min-content, 1fr\)/u, "equal slices wrapped 'Ma semaine'");
  assert.match(phone, /\.ck-nav-link \{[^}]*min-width: 48px; max-width: 40vw;/u);
  assert.match(phone, /\.ck-nav-link \{[^}]*font-size: min\(var\(--text-xs\), 0\.75rem\);[^}]*white-space: normal;/u, "still at most 12 px, two lines at a space when the names do not fit");
  assert.match(phone, /\.ck-nav-label \{[^}]*overflow-wrap: normal;/u, "never inside a word");
});

// ---------- 6. The package ----------

test("the kit says its version: 0.2.6-studio.1", () => {
  const pkg = JSON.parse(readFileSync(join(ui, "package.json"), "utf8")) as { version: string };
  assert.equal(pkg.version, "0.2.6-studio.1");
  const lock = JSON.parse(readFileSync(join(ui, "package-lock.json"), "utf8")) as { version: string; packages: Record<string, { version?: string }> };
  assert.equal(lock.version, "0.2.6-studio.1");
  assert.equal(lock.packages[""]?.version, "0.2.6-studio.1");
});
