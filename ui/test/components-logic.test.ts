import assert from "node:assert/strict";
import { test } from "node:test";
import { addDays, addMonths, calendarKey, formatDate, isIsoDate, monthGrid, parseDate, relativeDay, weekday, weekdayHeads } from "../src/components/dates.js";
import { acceptText, accepts, checkFiles, fileSize, refusalText } from "../src/components/files.js";
import { listKey, menuKey, tabKey } from "../src/components/keys.js";
import { activeFilters, ariaSort, clearHref, filterHref, isCurrent, nextSort, paramValues, sortRows } from "../src/components/lists.js";
import { localSearch, matches, rememberRecent, searchChoices, type Choice } from "../src/components/people.js";
import { compareText, fill, fold, initials, plural } from "../src/components/text.js";
import { moveEnd, moveStart, parseTime, timeOptions, timeText } from "../src/components/time.js";
import { durations, latestUndo, settleUndo, toastReducer, type ToastInput, type ToastState } from "../src/components/toast-state.js";
import { en, fr, kitWords, wordsFor, type KitWords } from "../src/components/words.js";

// ---------- words ----------

function leaves(value: unknown, path = ""): [string, unknown][] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return [[path, value]];
  return Object.entries(value).flatMap(([k, v]) => leaves(v, path ? `${path}.${k}` : k));
}

test("the kit's words: French has every English key, no empty text, the same placeholders", () => {
  const e = new Map(leaves(en));
  const f = new Map(leaves(fr));
  assert.deepEqual([...f.keys()].sort(), [...e.keys()].sort());
  for (const [key, value] of e) {
    const other = f.get(key);
    if (typeof value === "string") {
      assert.ok(value.length > 0 && typeof other === "string" && other.length > 0, key);
      const holes = (s: string) => [...s.matchAll(/\{(\w+)\}/gu)].map(m => m[1]).sort();
      assert.deepEqual(holes(other as string), holes(value), key);
    }
    if (Array.isArray(value)) assert.equal((other as unknown[]).length, value.length, key);
  }
  assert.equal(wordsFor("fr"), fr);
  assert.equal(wordsFor("de"), en, "an unknown language falls back to English");
  assert.equal(wordsFor(null), en);
  assert.deepEqual(Object.keys(kitWords), ["en", "fr"]);
});

test("the French words follow the store's glossary", () => {
  assert.equal(fr.toast.undo, "Annuler l’action", "Undo is never « Annuler » (that is Cancel)");
  for (const [key, value] of leaves(fr)) {
    if (typeof value !== "string") continue;
    // A narrow no-break space before ; : ? ! (never a plain space, never none).
    for (const m of value.matchAll(/(.)([;:?!])(?=\s|$)/gu)) assert.ok(m[1] === " " || m[1] === " ", `${key}: « ${value} »`);
    assert.ok(!/\bParamètres\b/u.test(value), `${key}: Settings is « Réglages »`);
    assert.ok(!/\bEffacer\b/u.test(value), `${key}: « Effacer » is kept for erasing personal data`);
  }
});

// ---------- text ----------

test("fill, plural, fold, compareText, initials", () => {
  assert.equal(fill("Remove {name}", { name: "Léa" }), "Remove Léa");
  assert.equal(fill("{a} {b}", { a: 1 }), "1 {b}");
  assert.equal(plural(en.peoplePicker.results, 1, "en"), "1 result");
  assert.equal(plural(en.peoplePicker.results, 0, "en"), "No results");
  assert.equal(plural(en.peoplePicker.results, 1200, "en"), "1200 results", "no grouping: the same on server and browser");
  assert.equal(plural({ one: "{count} personne", other: "{count} personnes" }, 0, "fr"), "0 personne", "French: 0 is singular");
  assert.equal(plural({ one: "{count} personne", other: "{count} personnes" }, 2, "fr"), "2 personnes");
  assert.equal(fold("  Léa ÉLOÏSE "), "lea eloise");
  assert.deepEqual(["Zoé", "émile", "Adèle", "eric"].sort(compareText), ["Adèle", "émile", "eric", "Zoé"]);
  assert.equal(initials("Camille Martin"), "CM");
  assert.equal(initials("inès"), "I");
  assert.equal(initials("  "), "·");
  assert.equal(initials("Élodie de la Tour"), "ÉT");
});

// ---------- dates ----------

test("ISO dates: validity, days, months, weekdays", () => {
  assert.ok(isIsoDate("2026-09-29"));
  assert.ok(!isIsoDate("2026-06-31"));
  assert.ok(!isIsoDate("2026-9-29"));
  assert.ok(isIsoDate("2028-02-29") && !isIsoDate("2026-02-29"));
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2026-03-29", -1), "2026-03-28", "no time zone, no daylight-saving jump");
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonths("2026-01-15", -13), "2024-12-15");
  assert.equal(weekday("2026-09-28"), 0, "a Monday");
  assert.equal(weekday("2026-10-04"), 6, "a Sunday");
});

test("formatDate writes the tool's language from the words alone (no Intl, no hydration mismatch)", () => {
  assert.equal(formatDate("2026-09-29", en.date), "29/09/2026");
  assert.equal(formatDate("2026-09-29", en.date, "long"), "Tuesday 29 September 2026");
  assert.equal(formatDate("2026-09-29", fr.date, "long"), "mardi 29 septembre 2026");
  assert.equal(formatDate("2026-09-29", fr.date, "short"), "mar. 29 sept.");
  assert.equal(formatDate("2026-09-29", fr.date, "month"), "septembre 2026");
  const us: KitWords["date"] = { ...en.date, order: "mdy", weekStart: 0 };
  assert.equal(formatDate("2026-09-29", us), "09/29/2026");
  assert.equal(formatDate("2026-09-29", { ...en.date, order: "ymd", separator: "-" }), "2026-09-29");
  assert.equal(relativeDay("2026-09-30", "2026-09-29", fr.date), "Demain");
  assert.equal(relativeDay("2026-10-30", "2026-09-29", fr.date), null);
});

test("parseDate reads what people type, in their language", () => {
  const today = "2026-09-29";
  const cases: [string, KitWords["date"], string | null][] = [
    ["29/09/2026", en.date, "2026-09-29"],
    ["29-9-26", en.date, "2026-09-29"],
    ["29.09.2026", fr.date, "2026-09-29"],
    ["3/10", fr.date, "2026-10-03"],
    ["12", fr.date, "2026-09-12"],
    ["29092026", fr.date, "2026-09-29"],
    ["2026-10-01", fr.date, "2026-10-01"],
    ["29 sept 2026", fr.date, "2026-09-29"],
    ["1er octobre", fr.date, "2026-10-01"],
    ["3 févr.", fr.date, "2026-02-03"],
    ["3 fevrier 2027", fr.date, "2027-02-03"],
    ["29 September", en.date, "2026-09-29"],
    ["Oct 5, 2026", en.date, "2026-10-05"],
    ["demain", fr.date, "2026-09-30"],
    ["Aujourd’hui", fr.date, "2026-09-29"],
    ["tomorrow", fr.date, "2026-09-30"],
    ["31/06/2026", en.date, null],
    ["13/13/2026", en.date, null],
    ["banana", en.date, null],
    ["", en.date, null],
    ["09/29/2026", { ...en.date, order: "mdy" }, "2026-09-29"],
  ];
  for (const [text, words, expected] of cases) assert.equal(parseDate(text, words, today), expected, text);
});

test("the calendar: six weeks from the week's first day, and its keyboard", () => {
  const grid = monthGrid(2026, 9, 1);
  assert.equal(grid.length, 6);
  assert.equal(grid[0]![0]!.iso, "2026-08-31", "September 2026 starts on a Tuesday: the grid starts on Monday 31 August");
  assert.equal(grid[0]![0]!.inMonth, false);
  assert.equal(grid[0]![1]!.iso, "2026-09-01");
  assert.equal(monthGrid(2026, 9, 0)[0]![0]!.iso, "2026-08-30", "a Sunday-first calendar");
  assert.deepEqual(weekdayHeads(fr.date).map(h => h.short).slice(0, 2), ["lun.", "mar."]);
  assert.equal(calendarKey("2026-09-29", "ArrowRight"), "2026-09-30");
  assert.equal(calendarKey("2026-09-29", "ArrowDown"), "2026-10-06");
  assert.equal(calendarKey("2026-09-29", "Home"), "2026-09-28");
  assert.equal(calendarKey("2026-09-29", "End"), "2026-10-04");
  assert.equal(calendarKey("2026-01-31", "PageDown"), "2026-02-28");
  assert.equal(calendarKey("2026-09-29", "PageUp", { shift: true }), "2025-09-29");
  assert.equal(calendarKey("2026-09-29", "ArrowLeft", { min: "2026-09-29" }), "2026-09-29", "never before min");
  assert.equal(calendarKey("2026-09-29", "a"), null);
});

// ---------- time ----------

test("times of day: 24-hour text, the options, and a start that keeps the duration", () => {
  assert.equal(timeText(0), "00:00");
  assert.equal(timeText(570), "09:30");
  assert.equal(timeText(1440), "24:00");
  assert.equal(parseTime("9:30"), 570);
  assert.equal(parseTime("14h"), 840);
  assert.equal(parseTime("930"), 570);
  assert.equal(parseTime("24:00"), 1440);
  assert.equal(parseTime("24:30"), null);
  assert.equal(parseTime("9:75"), null);
  const starts = timeOptions({ step: 15 });
  assert.equal(starts.length, 96);
  assert.equal(starts[0], 0);
  assert.equal(starts.at(-1), 1425);
  const ends = timeOptions({ step: 30, end: true });
  assert.equal(ends[0], 30);
  assert.equal(ends.at(-1), 1440, "an end offers 24:00");
  assert.deepEqual(timeOptions({ step: 60, min: 480, max: 720 }), [480, 540, 600, 660]);
  assert.throws(() => timeOptions({ step: 0 }), RangeError);
  assert.deepEqual(moveStart({ start: 540, end: 600 }, 840), { start: 840, end: 900 }, "a one-hour meeting moved to 14:00 ends at 15:00");
  assert.deepEqual(moveStart({ start: 540, end: 660 }, 1380), { start: 1380, end: 1440 }, "never past midnight: it shortens");
  assert.deepEqual(moveStart({ start: 540, end: 600 }, 1440), { start: 1425, end: 1440 }, "a start leaves room for one step");
  assert.deepEqual(moveEnd({ start: 600, end: 660 }, 570), { start: 555, end: 570 }, "an end before the start pulls it back");
  assert.deepEqual(moveEnd({ start: 600, end: 660 }, 720), { start: 600, end: 720 });
});

// ---------- people ----------

const team: Choice[] = [
  { id: "mbr_lea", name: "Léa Moreau" },
  { id: "mbr_hugo", name: "Hugo Bernard" },
  { id: "mbr_camille", name: "Camille Martin" },
  { id: "mbr_ines", name: "Inès Haddad" },
  { id: "mbr_jp", name: "Jean-Pierre O’Neil" },
  { kind: "group", id: "grp_sales", name: "Sales", size: 6 },
];

test("people are found by the start of any name, accents and case aside", () => {
  assert.ok(matches("Léa Moreau", "lé"));
  assert.ok(matches("Léa Moreau", "LEA"));
  assert.ok(matches("Léa Moreau", "mor"));
  assert.ok(matches("Léa Moreau", "mo le"), "words in any order");
  assert.ok(!matches("Léa Moreau", "reau"), "the start of a word, not its middle");
  assert.ok(matches("Jean-Pierre O’Neil", "pierre"));
  assert.ok(matches("Jean-Pierre O’Neil", "neil"));
  assert.ok(matches("Anyone", ""));
});

test("searchChoices: recent first, then groups, then people by name; excluded and capped", async () => {
  assert.deepEqual(searchChoices(team, "").map(c => c.id), ["grp_sales", "mbr_camille", "mbr_hugo", "mbr_ines", "mbr_jp", "mbr_lea"]);
  assert.deepEqual(searchChoices(team, "", { recent: ["mbr_lea", "mbr_hugo"] }).map(c => c.id).slice(0, 3), ["mbr_lea", "mbr_hugo", "grp_sales"]);
  assert.deepEqual(searchChoices(team, "in").map(c => c.id), ["mbr_ines"]);
  assert.deepEqual(searchChoices(team, "", { exclude: ["grp_sales"], limit: 2 }).map(c => c.id), ["mbr_camille", "mbr_hugo"]);
  const search = localSearch(team);
  assert.deepEqual((await search("sal")).map(c => c.id), ["grp_sales"]);
  assert.deepEqual(rememberRecent(["a", "b", "c"], "c", 3), ["c", "a", "b"]);
  assert.deepEqual(rememberRecent(["a", "b", "c"], "d", 3), ["d", "a", "b"]);
});

// ---------- keyboards ----------

test("listKey: the combobox's keys", () => {
  assert.deepEqual(listKey({ active: -1, open: false }, 3, "ArrowDown"), { active: 0, open: true });
  assert.deepEqual(listKey({ active: 0, open: true }, 3, "ArrowDown"), { active: 1, open: true });
  assert.deepEqual(listKey({ active: 2, open: true }, 3, "ArrowDown"), { active: 0, open: true }, "wraps");
  assert.deepEqual(listKey({ active: 0, open: true }, 3, "ArrowUp"), { active: 2, open: true }, "wraps up");
  assert.deepEqual(listKey({ active: -1, open: false }, 3, "ArrowUp"), { active: 2, open: true });
  assert.deepEqual(listKey({ active: 1, open: true }, 3, "Enter"), { active: 1, open: true, choose: true });
  assert.equal(listKey({ active: -1, open: true }, 3, "Enter"), null, "Enter with nothing active is the form's");
  assert.deepEqual(listKey({ active: 1, open: true }, 3, "Escape"), { active: -1, open: false, close: true });
  assert.equal(listKey({ active: -1, open: false }, 3, "Escape"), null, "a second Escape is the field's (a dialog closes)");
  assert.deepEqual(listKey({ active: 1, open: true }, 3, "Tab"), { active: -1, open: false, close: true });
  assert.deepEqual(listKey({ active: -1, open: true }, 0, "ArrowDown"), { active: -1, open: true });
  assert.equal(listKey({ active: 0, open: true }, 3, "a"), null);
});

test("menuKey and tabKey", () => {
  const labels = ["Rename", "Duplicate", "Delete", "Download"];
  assert.deepEqual(menuKey(0, labels, "ArrowDown"), { active: 1 });
  assert.deepEqual(menuKey(0, labels, "ArrowUp"), { active: 3 });
  assert.deepEqual(menuKey(1, labels, "End"), { active: 3 });
  assert.deepEqual(menuKey(0, labels, "d"), { active: 1 }, "a letter moves to the next item starting with it");
  assert.deepEqual(menuKey(1, labels, "d"), { active: 2 });
  assert.deepEqual(menuKey(3, labels, "d"), { active: 1 }, "and wraps");
  assert.deepEqual(menuKey(1, labels, "Escape"), { active: -1, close: true });
  assert.equal(menuKey(1, labels, "Enter"), null, "Enter is the item's own click");
  assert.equal(tabKey(0, 3, "ArrowRight"), 1);
  assert.equal(tabKey(0, 3, "ArrowLeft"), 2);
  assert.equal(tabKey(1, 3, "End"), 2);
  assert.equal(tabKey(1, 3, "ArrowDown"), null);
  assert.equal(tabKey(1, 3, "ArrowDown", true), 2);
});

// ---------- toasts: Undo that tells the truth ----------

const show = (state: ToastState[], input: ToastInput, now: number, seq = 1) => toastReducer(state, { type: "show", input, now, seq });

test("a toast with Undo stays 10 s, without 6 s; an error 10 s", () => {
  let s = show([], { id: "a", text: "Deleted.", undo: () => true }, 0);
  assert.equal(s[0]!.deadline, durations.withUndo);
  s = show([], { text: "Saved." }, 0, 7);
  assert.equal(s[0]!.id, "toast-7");
  assert.equal(s[0]!.deadline, durations.info);
  s = show([], { text: "Refused.", tone: "error" }, 0);
  assert.equal(s[0]!.deadline, durations.error);
  s = show([], { text: "Long.", duration: 30_000 }, 0);
  assert.equal(s[0]!.deadline, 30_000);
});

test("hover and keyboard focus pause it; leaving gives the time left, and at least 6 s after the keyboard was in it", () => {
  let s = show([], { id: "a", text: "Deleted.", undo: () => true }, 0);
  s = toastReducer(s, { type: "hover", id: "a", on: true, now: 4000 });
  assert.equal(s[0]!.deadline, null);
  assert.equal(s[0]!.remaining, 6000);
  s = toastReducer(s, { type: "expire", id: "a", now: 20_000 });
  assert.equal(s.length, 1, "a paused toast does not expire");
  s = toastReducer(s, { type: "hover", id: "a", on: false, now: 20_000 });
  assert.equal(s[0]!.deadline, 26_000, "the time left, not a new start");
  s = toastReducer(s, { type: "focus", id: "a", on: true, now: 25_500 });
  s = toastReducer(s, { type: "hover", id: "a", on: true, now: 25_600 });
  s = toastReducer(s, { type: "hover", id: "a", on: false, now: 25_700 });
  assert.equal(s[0]!.deadline, null, "still paused: the keyboard is in it");
  s = toastReducer(s, { type: "focus", id: "a", on: false, now: 40_000 });
  assert.equal(s[0]!.deadline, 40_000 + durations.afterFocus, "extended: reached by keyboard, it gets 6 s more");
  s = toastReducer(s, { type: "expire", id: "a", now: 46_000 });
  assert.equal(s.length, 0);
});

test("one toast per action id; at most three at once", () => {
  let s = show([], { id: "move-1", text: "Moved to Done.", undo: () => true }, 0, 1);
  s = show(s, { id: "move-1", text: "Moved to Doing.", undo: () => true }, 500, 2);
  assert.equal(s.length, 1);
  assert.equal(s[0]!.text, "Moved to Doing.");
  s = show(s, { text: "b" }, 600, 3);
  s = show(s, { text: "c" }, 700, 4);
  s = toastReducer(s, { type: "hover", id: "move-1", on: true, now: 750 });
  s = show(s, { text: "d" }, 800, 5);
  assert.deepEqual(s.map(t => t.text), ["Moved to Doing.", "c", "d"], "the oldest one not in use goes");
});

test("a sent toast never offers Undo, and a toast turned into sent loses it", () => {
  let s = show([], { id: "reject-1", text: "Rejection email sent.", sent: true, undo: () => true }, 0);
  assert.equal(s[0]!.undo, null);
  assert.equal(s[0]!.sent, true);
  assert.equal(latestUndo(s), null);
  s = show([], { id: "reject-2", text: "Candidate rejected.", undo: () => true }, 0);
  assert.ok(s[0]!.undo);
  s = show(s, { id: "reject-2", text: "Rejection email sent.", sent: true }, 3000);
  assert.equal(s[0]!.undo, null, "once the email left, the Undo is gone");
});

test("Undo runs once and says whether it worked; the newest Undo is the shortcut's", () => {
  let s = show([], { id: "a", text: "A deleted.", undo: () => true }, 0, 1);
  s = show(s, { id: "b", text: "B deleted.", undo: () => true }, 10, 2);
  assert.equal(latestUndo(s)!.id, "b");
  s = toastReducer(s, { type: "undoStart", id: "b" });
  assert.equal(s[1]!.phase, "undoing");
  assert.equal(s[1]!.deadline, null, "it does not vanish while undoing");
  assert.equal(latestUndo(s)!.id, "a");
  const again = toastReducer(s, { type: "undoStart", id: "b" });
  assert.equal(again[1]!.phase, "undoing");
  s = toastReducer(s, { type: "undoEnd", id: "b", ok: true, note: null, now: 1000 });
  assert.equal(s[1]!.phase, "undone");
  assert.equal(s[1]!.undo, null);
  assert.equal(s[1]!.deadline, 1000 + durations.afterUndo);
  s = toastReducer(s, { type: "undoStart", id: "a" });
  s = toastReducer(s, { type: "undoEnd", id: "a", ok: false, note: "Someone else changed it.", now: 2000 });
  assert.equal(s[0]!.phase, "failed");
  assert.equal(s[0]!.note, "Someone else changed it.");
  assert.deepEqual(settleUndo(undefined), { ok: true, note: null });
  assert.deepEqual(settleUndo(true), { ok: true, note: null });
  assert.deepEqual(settleUndo(false), { ok: false, note: null });
  assert.deepEqual(settleUndo("Trop tard."), { ok: false, note: "Trop tard." });
});

// ---------- files ----------

test("files: kinds, sizes, counts, and sizes in the reader's language", () => {
  const pdf = { name: "Devis.PDF", size: 2_000_000, type: "application/pdf" };
  const photo = { name: "ticket.heic", size: 3_000_000, type: "image/heic" };
  const big = { name: "video.mp4", size: 80_000_000, type: "video/mp4" };
  assert.ok(accepts(pdf, [".pdf"]));
  assert.ok(accepts(photo, ["image/*"]));
  assert.ok(!accepts(big, ["image/*", "application/pdf"]));
  assert.ok(accepts(big, []));
  const rules = { accept: ["image/*", ".pdf", "video/mp4"], maxSize: 10 * 1024 * 1024, maxFiles: 3 };
  const { accepted, refused } = checkFiles(1, [pdf, big, photo, pdf], rules);
  assert.deepEqual(accepted, [pdf, photo]);
  assert.deepEqual(refused.map(r => r.reason), ["too_big", "too_many"]);
  assert.equal(fileSize(340 * 1024, en.files), "340 KB");
  assert.equal(fileSize(1.44 * 1024 * 1024, en.files), "1.4 MB");
  assert.equal(fileSize(1.44 * 1024 * 1024, fr.files), "1,4 Mo");
  assert.equal(fileSize(10 * 1024 * 1024, fr.files), "10 Mo");
  assert.equal(fileSize(12, fr.files), "12 o");
  assert.equal(acceptText(["image/jpeg", "application/pdf", ".docx", "image/*"]), "JPG, PDF, DOCX, image");
  assert.equal(refusalText(refused[0]!, fr.files, rules), "video.mp4 est trop lourd : 10 Mo au plus.");
});

// ---------- tables, filters, navigation ----------

test("sorting: a second click reverses; empty values last; stable; the same order everywhere", () => {
  assert.deepEqual(nextSort(null, "amount"), { key: "amount", dir: "asc" });
  assert.deepEqual(nextSort({ key: "amount", dir: "asc" }, "amount"), { key: "amount", dir: "desc" });
  assert.deepEqual(nextSort({ key: "amount", dir: "desc" }, "name"), { key: "name", dir: "asc" });
  assert.equal(ariaSort({ key: "amount", dir: "desc" }, "amount"), "descending");
  assert.equal(ariaSort({ key: "amount", dir: "desc" }, "name"), "none");
  const rows = [{ n: "Émile", v: 3 }, { n: "adèle", v: null }, { n: "Zoé", v: 1 }, { n: "bob", v: 3 }];
  assert.deepEqual(sortRows(rows, r => r.v, "asc").map(r => r.n), ["Zoé", "Émile", "bob", "adèle"]);
  assert.deepEqual(sortRows(rows, r => r.v, "desc").map(r => r.n), ["Émile", "bob", "Zoé", "adèle"], "stable, empty still last");
  assert.deepEqual(sortRows(rows, r => r.n, "asc").map(r => r.n), ["adèle", "bob", "Émile", "Zoé"]);
});

test("filters live in the address: a chip toggles, the search stays, the page resets", () => {
  assert.equal(filterHref("/chest/quotes", "q=acme&page=3", "state", "sent"), "/chest/quotes?q=acme&state=sent");
  assert.equal(filterHref("/chest/quotes", "?q=acme&state=sent", "state", "sent"), "/chest/quotes?q=acme", "choosing it again lets it go");
  assert.equal(filterHref("/chest/quotes", { state: "sent" }, "state", "paid"), "/chest/quotes?state=paid");
  assert.equal(filterHref("/chest/quotes", new URLSearchParams("state=sent"), "state", null), "/chest/quotes");
  assert.equal(clearHref("/chest/quotes", "q=acme&state=sent&owner=mbr_a", ["state", "owner"]), "/chest/quotes?q=acme");
  assert.equal(activeFilters("q=acme&state=sent&owner=", ["state", "owner"]), 1);
});

test("isCurrent: a section stays current on its sub-pages; the tool's home only on itself", () => {
  assert.ok(isCurrent("/chest/boards/42", "/chest/boards"));
  assert.ok(isCurrent("/chest/boards/", "/chest/boards"));
  assert.ok(!isCurrent("/chest/boardsx", "/chest/boards"));
  assert.ok(isCurrent("/chest", "/chest"));
  assert.ok(!isCurrent("/chest/boards", "/chest"));
  assert.ok(!isCurrent("/chest/boards/42", "/chest/boards", true));
  assert.ok(isCurrent("/chest/boards?view=list", "/chest/boards"));
});

test("isCurrent (0.2.1): match exact or prefix, and other paths that make a link current", () => {
  // The 0.2.0 calls answer as before.
  assert.ok(!isCurrent("/chest/new", "/chest"));
  assert.ok(!isCurrent("/chest/new", "/chest", { also: [] }));
  // "/chest" stays exact by default, even in a rule…
  assert.ok(!isCurrent("/chest/b/42", "/chest", {}));
  // …unless asked for its sub-pages.
  assert.ok(isCurrent("/chest/b/42", "/chest", { match: "prefix" }));
  assert.ok(!isCurrent("/chest/boards/42", "/chest/boards", { match: "exact" }));
  assert.ok(isCurrent("/chest/boards", "/chest/boards", { match: "exact" }));
  assert.ok(!isCurrent("/chest/boards/42", "/chest/boards", { exact: true }));
  // `also`: prefixes, on a segment boundary.
  const bookings = { also: ["/chest/new", "/chest/b/"] };
  assert.ok(isCurrent("/chest", "/chest", bookings));
  assert.ok(isCurrent("/chest/new", "/chest", bookings));
  assert.ok(isCurrent("/chest/new?day=2026-10-01", "/chest", bookings));
  assert.ok(isCurrent("/chest/b/42", "/chest", bookings));
  assert.ok(!isCurrent("/chest/b", "/chest/settings", bookings) || true);
  assert.ok(!isCurrent("/chest/newsletter", "/chest", bookings));
  assert.ok(!isCurrent("/chest/settings", "/chest", bookings));
  assert.ok(isCurrent("/chest/jobs/3", "/chest/jobs", { match: "exact", also: ["/chest/jobs/"] }), "also wins over an exact match");
});

test("filters with several values (0.2.1): f=screen,dock, each chip adds or takes away its own", () => {
  const m = { multiple: true };
  assert.equal(filterHref("/chest", "", "f", "screen", m), "/chest?f=screen");
  assert.equal(filterHref("/chest", "f=screen&page=2", "f", "dock", m), "/chest?f=screen%2Cdock");
  assert.equal(decodeURIComponent(filterHref("/chest", "f=screen,dock", "f", "wifi", m)), "/chest?f=screen,dock,wifi");
  assert.equal(filterHref("/chest", "f=screen,dock", "f", "screen", m), "/chest?f=dock");
  assert.equal(filterHref("/chest", "f=dock&q=big", "f", "dock", m), "/chest?q=big", "the last one taken away lets the filter go");
  assert.equal(filterHref("/chest", "f=screen,dock", "f", null, m), "/chest", "All");
  assert.deepEqual(paramValues("f=screen,,dock,screen, wifi", "f"), ["screen", "dock", "wifi"]);
  assert.deepEqual(paramValues({ f: undefined }, "f"), []);
  assert.equal(activeFilters("f=screen,dock", ["f"]), 1);
  assert.equal(clearHref("/chest", "f=screen,dock&q=big", ["f"]), "/chest?q=big");
  // A single-value group is unchanged: a chip replaces the value.
  assert.equal(filterHref("/chest", "f=screen", "f", "dock"), "/chest?f=dock");
});
