// Checks a tool's words against the store's glossary (lab/GLOSSARY.md):
// its lib/i18n/en.ts and fr.ts, key by key. Report only — it changes
// nothing; exits 1 when an error is found.
//
//   node scripts/lint-words.mjs tools/private/<name>
//   node scripts/lint-words.mjs tools/public-and-private/<name> --json
//
// Needs Node 22.18 or later (it imports the catalogues' TypeScript).
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const args = process.argv.slice(2);
const folder = args.find(a => !a.startsWith("--"));
const asJson = args.includes("--json");
if (!folder || !existsSync(join(folder, "lib", "i18n", "en.ts")) || !existsSync(join(folder, "lib", "i18n", "fr.ts"))) {
  console.error("usage: node scripts/lint-words.mjs <tool folder> [--json]   (with lib/i18n/en.ts and fr.ts)");
  process.exit(2);
}

async function catalogue(lang) {
  const mod = await import(pathToFileURL(resolve(folder, "lib", "i18n", `${lang}.ts`)).href);
  const value = mod[lang] ?? mod.default ?? Object.values(mod).find(v => v && typeof v === "object");
  if (!value || typeof value !== "object") throw new Error(`no catalogue exported by ${lang}.ts`);
  return value;
}

function leaves(value, path = "") {
  if (typeof value === "string") return [[path, value]];
  if (Array.isArray(value)) return value.flatMap((v, i) => leaves(v, `${path}[${i}]`));
  if (value && typeof value === "object") return Object.entries(value).flatMap(([k, v]) => leaves(v, path ? `${path}.${k}` : k));
  return [];
}

const en = new Map(leaves(await catalogue("en")));
const fr = new Map(leaves(await catalogue("fr")));
const found = [];
const add = (level, rule, key, message, text) => found.push({ level, rule, key, message, text });

// The three verbs and their families (word starts, accents as written).
const families = [
  { name: "Remove", en: /\bremov(e|ed|es|ing|al)\b/iu, fr: /\b(retir\p{L}*|enlev\p{L}*|enlèv\p{L}*)/iu, frName: "Retirer" },
  { name: "Delete", en: /\bdelet(e|ed|es|ing|ion)\b/iu, fr: /\bsuppr\p{L}*/iu, frName: "Supprimer" },
  { name: "Erase", en: /\beras(e|ed|es|ing|ure)\b/iu, fr: /\beffac\p{L}*/iu, frName: "Effacer" },
];
const undoFr = /^annuler l[’']action\b/iu;
const bare = s => s.trim().replace(/[.!…]+$/u, "").trim();

for (const [key, e] of en) {
  const f = fr.get(key);
  // English-only rules.
  if (/\b\d{1,2}(:\d{2})?\s?(AM|PM|am|pm)\b/u.test(e) || /\b(mm\/dd|MM\/DD)\b/u.test(e)) add("error", "clock", key, "24-hour clock and day/month/year (never AM/PM, never mm/dd)", e);
  if (/\bare you sure\b/iu.test(e)) add("warning", "are-you-sure", key, "act and offer Undo instead of asking", e);
  if (/\.\.\./u.test(e)) add("warning", "ellipsis", key, "use … (one character)", e);
  if (typeof f !== "string") continue;
  // Undo / Cancel.
  if (/^undo$/iu.test(bare(e)) && !undoFr.test(bare(f))) add("error", "undo", key, "Undo is « Annuler l’action »", `${e} → ${f}`);
  if (/\bundo\b/iu.test(e) && /\brétabli/iu.test(f)) add("error", "undo-restore", key, "« Rétablir » is Restore: Undo is « Annuler l’action »", `${e} → ${f}`);
  if (/^cancel$/iu.test(bare(e)) && undoFr.test(bare(f))) add("error", "cancel-undo", key, "Cancel is « Annuler », not « Annuler l’action »", `${e} → ${f}`);
  // Remove / Delete / Erase.
  const inEn = families.filter(fam => fam.en.test(e));
  if (inEn.length === 1) {
    const expected = inEn[0];
    const inFr = families.filter(fam => fam.fr.test(f));
    if (inFr.length > 0 && !inFr.includes(expected)) add("error", "verb", key, `${expected.name} is « ${expected.frName} » (here « ${inFr.map(x => x.frName).join(", ")} »)`, `${e} → ${f}`);
  }
}

for (const [key, f] of fr) {
  if (/\bParamètres\b/u.test(f)) add("error", "settings", key, "Settings is « Réglages »", f);
  if (/\bassign(er|é|ée|és|ées|ez|ons)\b/iu.test(f)) add("warning", "assign", key, "prefer « Attribuer » (« assigner » is to summon)", f);
  if (/\bêtes[- ]vous (sûr|certain)/iu.test(f)) add("warning", "are-you-sure", key, "act and offer « Annuler l’action » instead of asking", f);
  if (/"/u.test(f)) add("warning", "quotes", key, "guillemets « » in French", f);
  if (/\.\.\./u.test(f)) add("warning", "ellipsis", key, "use … (one character)", f);
  if (/\p{L}'\p{L}/u.test(f)) add("warning", "apostrophe", key, "typographic apostrophe ’", f);
  // A narrow no-break space (or a no-break space) before ; : ? ! — when the
  // sign ends a phrase (followed by a space, the end, a closing sign), not
  // in a time (10:30), an address (https://) or a query (?back=).
  const spaced = /[  ]/u;
  for (const m of f.matchAll(/(^|.)([;:?!])(?=$|[\s»)\]"’.,…])/gu)) {
    const before = m[1];
    const at = m.index + m[1].length;
    const prev2 = f.slice(Math.max(0, at - 2), at);
    if (m[2] === ":" && /\d$/u.test(prev2) && /^\d/u.test(f.slice(at + 1))) continue;
    if (before === "" || spaced.test(before)) continue;
    if (/[?!]/u.test(before) && /[?!]/u.test(m[2])) continue; // "?!" counts once
    add("error", "fr-space", key, before === " " ? `a plain space before « ${m[2]} »: use a narrow no-break space (U+202F)` : `no space before « ${m[2]} »: add a narrow no-break space (U+202F)`, f);
    break;
  }
  if (/«(?![  ])/u.test(f) || /(?<![  ])»/u.test(f)) add("error", "fr-space", key, "« guillemets » take a narrow no-break space inside", f);
}

const errors = found.filter(x => x.level === "error");
const warnings = found.filter(x => x.level === "warning");
if (asJson) console.log(JSON.stringify({ folder, errors: errors.length, warnings: warnings.length, byRule: Object.fromEntries([...new Set(found.map(x => x.rule))].map(r => [r, found.filter(x => x.rule === r).length])), found }, null, 2));
else {
  for (const x of found) console.log(`${x.level === "error" ? "error  " : "warning"} ${x.rule.padEnd(13)} ${x.key}: ${x.message}\n          ${JSON.stringify(x.text)}`);
  console.log(`\n${folder}: ${errors.length} error(s), ${warnings.length} warning(s) against lab/GLOSSARY.md (${en.size} English and ${fr.size} French strings).`);
}
process.exit(errors.length > 0 ? 1 : 0);
