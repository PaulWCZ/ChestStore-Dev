// Builds showcase/index.html: every tool's identity side by side (the style
// contest), and the same tools compared in the looks a company can choose
// (report 04): each tool's own identity, the Chest look, a company brand.
// One static page that opens with a double-click: no server, no network,
// no script — icons inline, fonts and screenshots by relative paths into
// tools/, the look switch in CSS (radio buttons and :has()). Reads each
// tool's chest.json, DESIGN.md (its ```json showcase block), docs/screens/
// and docs/screens.json (the "look" each screenshot was taken in).
//
//   node scripts/build-showcase.mjs
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "showcase", "index.html");
const escape = v => String(v ?? "").replace(/[&<>"']/gu, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const rel = p => relative(dirname(out), p).split("\\").join("/");

// The looks a visitor can compare. "sample" and "port" are the harness's two
// company brands (lab/chest-dev/brand/sample.mjs: brand:sample is Atelier
// Martin, brand:port is Café du Port).
const LOOKS = [
  { id: "own", label: "Own identity", hint: "each tool as its designer made it" },
  { id: "chest", label: "Chest look", hint: "the sober catalogue theme, for every tool" },
  { id: "sample", label: "Brand: Atelier Martin", hint: "the harness's sample brand (green and amber)" },
  { id: "port", label: "Brand: Café du Port", hint: "the harness's second brand (light yellow, navy, sharp, compact)" },
];
const lookLabel = id => LOOKS.find(l => l.id === id)?.label ?? "Catalogue theme";
const themeName = id => id.replace(/-/gu, " ").replace(/^./u, c => c.toUpperCase());

// What a screenshot actually shows. A shot's "look" (lab/chest-dev/screens.mjs)
// is {all, tool}: the company's choice for all tools, and this tool's
// override ("inherit" or absent: the choice for all). A page outside /chest
// is public, and public pages never wear a catalogue theme (the Chest look
// included): they keep the tool's own identity (report 04, "Public pages").
function lookOf(entry) {
  const spec = entry.look ? (entry.look.tool && entry.look.tool !== "inherit" ? entry.look.tool : entry.look.all ?? "own") : "own";
  const isPublic = typeof entry.path === "string" && !entry.path.startsWith("/chest");
  if (spec === "brand:sample") return { look: "sample", isPublic };
  if (spec === "brand:port") return { look: "port", isPublic };
  if (spec.startsWith("catalogue:")) {
    const id = spec.slice("catalogue:".length);
    if (isPublic) return { look: "own", isPublic, keptOwn: id === "chest" ? "Chest look" : `the ${themeName(id)} theme` };
    return id === "chest" ? { look: "chest", isPublic } : { look: "theme", theme: themeName(id), isPublic };
  }
  return { look: "own", isPublic };
}

// A screenshot without an entry in screens.json (renamed, or taken by hand):
// its look is guessed from its name.
function guessLook(name) {
  if (/-port(-|$)/u.test(name)) return { look: "port", guessed: true };
  if (/-brand(-|$)/u.test(name)) return { look: "sample", guessed: true };
  if (/-chest(-|$)/u.test(name)) return { look: "chest", guessed: true };
  if (/-theme(-|$)/u.test(name)) return { look: "theme", theme: "a catalogue", guessed: true };
  return { look: "own", guessed: true };
}

function tool(folder, kind) {
  const manifest = JSON.parse(readFileSync(join(folder, "chest.json"), "utf8"));
  const design = existsSync(join(folder, "DESIGN.md")) ? readFileSync(join(folder, "DESIGN.md"), "utf8") : "";
  const block = /```json showcase\n([\s\S]*?)```/u.exec(design)?.[1];
  let show = {};
  try {
    show = block ? JSON.parse(block) : {};
  } catch (e) {
    console.warn(`${folder}: DESIGN.md showcase block is not JSON (${e.message})`);
  }
  const personality = /## Name and personality\s+([\s\S]*?)\n##/u.exec(design)?.[1]?.trim().split("\n\n")[0] ?? "";
  const why = /## Why\s+([\s\S]*?)(\n```|\n##|$)/u.exec(design)?.[1]?.trim() ?? "";
  const iconPath = manifest.icon && existsSync(join(folder, manifest.icon)) ? join(folder, manifest.icon) : null;
  const icon = iconPath?.endsWith(".svg") ? readFileSync(iconPath, "utf8").replace(/<\?xml[^>]*>/u, "") : iconPath ? `<img src="${rel(iconPath)}" alt="">` : "";
  const screensDir = join(folder, "docs", "screens");
  const screens = existsSync(screensDir) ? readdirSync(screensDir).filter(f => f.endsWith(".png")).sort() : [];
  let entries = [];
  const listFile = join(folder, "docs", "screens.json");
  if (existsSync(listFile)) {
    try {
      entries = JSON.parse(readFileSync(listFile, "utf8"));
      if (!Array.isArray(entries)) entries = [];
    } catch (e) {
      console.warn(`${folder}: docs/screens.json is not JSON (${e.message})`);
    }
  }
  const byName = new Map(entries.filter(e => typeof e?.name === "string").map((e, order) => [e.name, { ...e, order }]));
  const pairs = [...new Set(screens.map(f => f.replace(/-(desktop|phone)\.png$/u, "")))].map(name => {
    const entry = byName.get(name);
    return {
      name,
      desktop: screens.includes(`${name}-desktop.png`) ? rel(join(screensDir, `${name}-desktop.png`)) : null,
      phone: screens.includes(`${name}-phone.png`) ? rel(join(screensDir, `${name}-phone.png`)) : null,
      path: entry?.path ?? null,
      order: entry?.order ?? 999,
      dark: Boolean(entry?.dark ?? /-dark(-|$)/u.test(name)),
      french: (entry?.locale ?? (/-fr(-|$)/u.test(name) ? "fr" : "en")) === "fr",
      actions: Boolean(entry?.actions?.length),
      ...(entry ? lookOf(entry) : guessLook(name)),
    };
  });
  const fonts = Object.entries(show.fonts ?? {}).filter(([, f]) => f?.file && existsSync(join(folder, f.file)));
  return { folder, kind, manifest, show, personality, why, icon, pairs, fonts, updated: statSync(join(folder, "chest.json")).mtime };
}

const kinds = [["private", "Team tools", "Behind the Chest's sign-in: the company's intranet."], ["public-and-private", "Tools with a public part", "A private side for the team, a public side for customers, candidates, visitors."]];
const groups = kinds.map(([kind, title, intro]) => {
  const dir = join(root, "tools", kind);
  const folders = existsSync(dir) ? readdirSync(dir).map(n => join(dir, n)).filter(p => statSync(p).isDirectory() && existsSync(join(p, "chest.json"))) : [];
  const order = readRanking();
  const tools = folders.map(f => tool(f, kind)).sort((a, b) => (order.indexOf(a.manifest.name) + 1 || 99) - (order.indexOf(b.manifest.name) + 1 || 99));
  return { kind, title, intro, tools };
});

// The ranking's order (reports/01-ranking.md, the folder names in its table).
function readRanking() {
  const file = join(root, "reports", "01-ranking.md");
  if (!existsSync(file)) return [];
  return [...readFileSync(file, "utf8").matchAll(/`tools\/(?:private|public-and-private)\/([a-z0-9-]+)\/?`/gu)].map(m => m[1]);
}

let faceId = 0;
const faces = [];
function fontFamily(tool, which) {
  const entry = tool.show.fonts?.[which];
  if (!entry?.file || !existsSync(join(tool.folder, entry.file))) return null;
  const family = `f${++faceId}`;
  faces.push(`@font-face{font-family:${family};src:url("${rel(join(tool.folder, entry.file))}") format("woff2");font-weight:100 900;font-display:swap}`);
  return { family, weight: entry.weight ?? 400, name: entry.family };
}

// The words under a screenshot: its look, and what differs from a plain
// English light screen.
function lookWords(p) {
  if (p.look === "theme") return `${p.theme} theme`;
  if (p.keptOwn) return `Own identity (public page: ${p.keptOwn} does not apply)`;
  return lookLabel(p.look);
}
function tags(p) {
  return [p.french && "French", p.dark && "dark mode"].filter(Boolean);
}

function card(t) {
  const display = fontFamily(t, "display");
  const body = fontFamily(t, "body");
  const title = t.manifest.title ?? t.manifest.name;
  const swatches = (t.show.colors ?? []).map(c => `<li><span style="background:${escape(c.value)}"></span><b>${escape(c.name)}</b><code>${escape(c.value)}</code></li>`).join("");
  const shots = t.pairs.map((p, i) => {
    const what = [p.name, lookWords(p), ...tags(p)].join(" · ");
    return `<figure class="shot${i === 0 ? " first" : ""}" data-look="${escape(p.look)}">${p.desktop ? `<a href="${escape(p.desktop)}"><img loading="lazy" class="desktop" src="${escape(p.desktop)}" alt="${escape(title)} — ${escape(what)}, desktop"></a>` : ""}${p.phone ? `<a href="${escape(p.phone)}"><img loading="lazy" class="phone" src="${escape(p.phone)}" alt="${escape(title)} — ${escape(what)}, phone"></a>` : ""}<figcaption>${escape(p.name)}${p.look === "own" ? "" : ` · ${escape(p.look === "theme" ? `${p.theme} theme` : lookLabel(p.look))}`}</figcaption></figure>`;
  }).join("");
  // In a look view, a tool with no screenshot in that look says so.
  const empty = LOOKS.filter(l => !t.pairs.some(p => p.look === l.id)).map(l => `<p class="none empty" data-empty="${l.id}">No screenshot of ${escape(title)} in “${escape(l.label)}” yet.</p>`).join("");
  const publicNote = t.kind === "public-and-private" ? `<p class="none public-note">Its public pages keep their own identity in the Chest look (they wear only a company brand).</p>` : "";
  const accent = t.show.colors?.[2]?.value ?? t.show.colors?.[0]?.value ?? "#888";
  return `<article class="tool" id="${escape(t.manifest.name)}" style="--tool-accent:${escape(accent)}">
  <header>
    <div class="icon" aria-hidden="true">${t.icon}</div>
    <div><h3>${escape(title)}</h3><p class="desc">${escape(t.manifest.description ?? "")}</p>
    <p class="adj">${(t.show.adjectives ?? []).map(a => `<span>${escape(a)}</span>`).join("")}<code>${escape(relative(root, t.folder))}</code></p></div>
  </header>
  <div class="identity">
    <div class="specimen" style="${display ? `font-family:${display.family};font-weight:${display.weight}` : ""}">
      <p class="big">${escape(t.show.specimen ?? t.manifest.title)}</p>
      <p class="small" style="${body ? `font-family:${body.family};font-weight:${body.weight}` : ""}">${escape(display?.name ?? "")}${body && body.name !== display?.name ? " · " + escape(body.name) : ""} — Aa Bb Cc Éé 0123456789 €</p>
    </div>
    <ul class="swatches">${swatches}</ul>
  </div>
  ${t.why ? `<p class="why">${escape(t.why.replace(/\s+/gu, " "))}</p>` : ""}
  ${publicNote}
  <div class="shots">${shots || '<p class="none">No screenshots yet.</p>'}${t.pairs.length ? empty : ""}</div>
</article>`;
}

// ---- The looks, side by side ------------------------------------------------
// For each tool, the one screen best covered in every look: the page (its
// path in screens.json) with the most looks in the same device, light mode
// first. A look missing on that page falls back to another page in that
// look (said under it); a look missing everywhere is a gap (said, never
// hidden).
// Lexicographic order of two score lists: is a below b?
const before = (a, b) => {
  const i = a.findIndex((v, j) => v !== b[j]);
  return i >= 0 && a[i] < b[i];
};
function pickLooks(t) {
  const screens = t.pairs.filter(p => p.look !== "theme");
  const pageOf = p => p.path ?? p.name.replace(/-(chest|theme|brand|port|dark|fr|all)(?=-|$)/gu, "");
  const pages = [...new Set(screens.filter(p => p.look === "own").map(pageOf))];
  const rank = (p, device) => (p[device] ? 0 : 100) + (p.dark ? 10 : 0) + (p.actions ? 4 : 0) + (p.french ? 1 : 0) + p.order / 1000;
  const best = (list, device) => list.slice().sort((a, b) => rank(a, device) - rank(b, device))[0] ?? null;
  let choice = null;
  for (const page of pages) {
    const isPublic = screens.some(p => pageOf(p) === page && p.isPublic);
    for (const device of ["desktop", "phone"]) {
      let score = 0;
      for (const l of LOOKS) {
        const here = screens.filter(p => pageOf(p) === page && p.look === l.id && p[device] && !p.keptOwn);
        score += here.some(p => !p.dark) ? 2 : here.length ? 1 : 0;
      }
      const order = Math.min(...screens.filter(p => pageOf(p) === page).map(p => p.order));
      const key = [score, device === "desktop" ? 1 : 0, isPublic ? 0 : 1, -order];
      if (!choice || before(choice.key, key)) choice = { page, device, key, isPublic };
    }
  }
  if (!choice) return null;
  const cells = LOOKS.map(l => {
    const inLook = screens.filter(p => p.look === l.id && !p.keptOwn);
    const same = inLook.filter(p => pageOf(p) === choice.page);
    const shot = best(same, choice.device) ?? best(inLook, choice.device);
    if (!shot) return { look: l, shot: null, why: l.id === "chest" && t.kind === "public-and-private" && choice.isPublic ? "public" : "none" };
    const device = shot[choice.device] ? choice.device : shot.desktop ? "desktop" : "phone";
    return { look: l, shot, device, otherPage: pageOf(shot) !== choice.page };
  });
  const main = cells[0].shot;
  return { page: choice.page, device: choice.device, isPublic: choice.isPublic, cells, main };
}

// A PNG's size, from its header (so a lazy image holds its place).
function pngSize(file) {
  try {
    const head = readFileSync(resolve(dirname(out), file)).subarray(16, 24);
    return { width: head.readUInt32BE(0), height: head.readUInt32BE(4) };
  } catch {
    return null;
  }
}

const gaps = [];
function lookRow(t) {
  const title = t.manifest.title ?? t.manifest.name;
  const pick = pickLooks(t);
  if (!pick) {
    gaps.push({ tool: title, looks: LOOKS.map(l => l.label), text: "no screenshot at all" });
    return `<article class="look-row"><h3><span class="mini" aria-hidden="true">${t.icon}</span>${escape(title)}</h3><p class="none">No screenshots yet.</p></article>`;
  }
  const missing = [];
  const cells = pick.cells.map(c => {
    const head = `<b>${escape(c.look.label)}</b>`;
    if (!c.shot) {
      const text = c.why === "public"
        ? "No team-side screenshot in this look yet. Its public pages keep their own identity in the Chest look anyway."
        : "No screenshot in this look yet.";
      missing.push({ look: c.look.label, text: "missing" });
      return `<div class="cell gap" data-look="${c.look.id}">${head}<p>${escape(text)}</p></div>`;
    }
    const s = c.shot;
    const src = s[c.device];
    const notes = [c.otherPage ? "a different page" : null, c.device !== pick.device ? `${c.device} only` : null, ...tags(s)].filter(Boolean);
    if (c.otherPage) missing.push({ look: c.look.label, text: `not on “${pick.main?.name ?? pick.page}”, shown on “${s.name}”` });
    const what = [lookWords(s), s.name, c.device, ...tags(s)].join(", ");
    const size = pngSize(src);
    return `<figure class="cell ${escape(c.device)}" data-look="${c.look.id}"><figcaption>${head}<span>${escape(s.name)}${notes.length ? ` — ${escape(notes.join(", "))}` : ""}</span></figcaption><a href="${escape(src)}"><img loading="lazy" src="${escape(src)}"${size ? ` width="${size.width}" height="${size.height}"` : ""} alt="${escape(title)} in the ${escape(c.look.label)}: ${escape(what)}"></a></figure>`;
  }).join("");
  if (missing.length) gaps.push({ tool: title, id: t.manifest.name, items: missing });
  return `<article class="look-row" id="looks-${escape(t.manifest.name)}">
  <h3><span class="mini" aria-hidden="true">${t.icon}</span>${escape(title)} <small>${escape(pick.main?.name ?? pick.page)} · ${escape(pick.device)}</small></h3>
  <div class="cells">${cells}</div>
</article>`;
}

const sections = groups.map(g => `<section class="group"><h2>${escape(g.title)} <small>${g.tools.length}</small></h2><p class="intro">${escape(g.intro)}</p>${g.tools.map(card).join("\n") || '<p class="none">None yet.</p>'}</section>`).join("\n");
const allTools = groups.flatMap(g => g.tools);
const count = allTools.length;
const rows = allTools.map(lookRow).join("\n");
const gapList = gaps.length
  ? `<h3 class="gaps-title">What is missing</h3><p class="none">Every tool has at least one screenshot in each of the four looks. On these, a look was not photographed on the compared page, so another page stands in:</p><ul class="gaps">${gaps.map(g => g.items
    ? `<li><a href="#looks-${escape(g.id)}">${escape(g.tool)}</a>: ${g.items.map(i => `${escape(i.look)} ${escape(i.text)}`).join("; ")}.</li>`
    : `<li>${escape(g.tool)}: ${escape(g.text)}.</li>`).join("")}</ul>`
  : `<p class="none">Every tool has the same page in every look.</p>`;
const looksSection = `<section class="group looks" id="looks" aria-labelledby="looks-title">
<h2 id="looks-title">Looks, side by side <small>${count}</small></h2>
<p class="intro">Same features, only the design changes. A company keeps each tool's own identity, dresses every tool in the Chest look, or imports its brand — and can choose otherwise for any one tool. Here is the same page of each tool in each look, as the harness photographed it (<code>docs/screens.json</code> says which look each screenshot wears). When a look is missing on that page, another page in that look stands in, and says so.</p>
<div class="look-heads" aria-hidden="true">${LOOKS.map(l => `<span data-look="${l.id}"><b>${escape(l.label)}</b>${escape(l.hint)}</span>`).join("")}</div>
${rows}
${gapList}
</section>`;

// The UI kit's gallery (ui/gallery/index.html, built by ui's npm run
// gallery): the same identities as themes, and a brand demo.
const galleryPath = join(root, "ui", "gallery", "index.html");
const gallery = existsSync(galleryPath) ? rel(galleryPath) : null;
const index = allTools.map(t => `<a href="#${escape(t.manifest.name)}"><span class="mini" aria-hidden="true">${t.icon}</span>${escape(t.manifest.title ?? t.manifest.name)}</a>`).join("");

// The switch: radio buttons; CSS (:has) shows the gallery in the chosen look.
const views = [{ id: "all", label: "Every screenshot" }, ...LOOKS];
const lookSwitch = `<fieldset class="switch"><legend>Show the whole store in</legend>${views.map((v, i) => `<input type="radio" name="look" id="look-${v.id}" value="${v.id}"${i === 0 ? " checked" : ""}><label for="look-${v.id}">${escape(v.label)}</label>`).join("")}</fieldset>`;
const viewCss = LOOKS.map(l => `body:has(#look-${l.id}:checked) .shot:not([data-look="${l.id}"]){display:none}
body:has(#look-${l.id}:checked) .empty[data-empty="${l.id}"]{display:block}
body:has(#look-${l.id}:checked) .cell[data-look="${l.id}"]{outline:3px solid var(--ink);outline-offset:3px}
body:has(#look-${l.id}:checked) .look-heads [data-look="${l.id}"]{background:var(--ink);color:var(--bg)}`).join("\n");

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Chest store — the style contest</title>
<style>
${faces.join("\n")}
:root{--bg:#f3f1ec;--ink:#1d1c1a;--muted:#6b675f;--card:#fff;--line:#e2ded5}
@media (prefers-color-scheme:dark){:root{--bg:#141412;--ink:#eeebe4;--muted:#a19c91;--card:#1d1c1a;--line:#302e2a}}
*{box-sizing:border-box}html{scroll-padding-top:160px}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
:focus-visible{outline:3px solid var(--ink);outline-offset:2px}
.top{padding:56px 24px 24px;max-width:1320px;margin:auto}.top-links{display:flex;flex-wrap:wrap;gap:10px;margin-top:12px!important}.top-links a{display:inline-block;padding:8px 16px;border-radius:999px;background:var(--ink);color:var(--bg);text-decoration:none;font-weight:600}.top-links a.quiet{background:var(--card);color:var(--ink);border:1px solid var(--line)}.top h1{font:600 clamp(32px,5vw,56px)/1.05 ui-serif,Georgia,serif;margin:0 0 12px;letter-spacing:-.02em}.top p{color:var(--muted);max-width:60ch;margin:0}
.bar{position:sticky;top:0;z-index:2;background:color-mix(in srgb,var(--bg) 94%,transparent);backdrop-filter:blur(8px);border-bottom:1px solid var(--line)}
.switch{max-width:1320px;margin:auto;padding:12px 24px 0;border:0;display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.switch legend{float:left;margin-right:8px;font-weight:600;font-size:14px;padding:0}
.switch input{position:absolute;opacity:0;width:1px;height:1px;margin:0}
.switch label{padding:6px 14px;border:1px solid var(--muted);border-radius:999px;background:var(--card);font-size:14px;cursor:pointer;min-height:36px;display:inline-flex;align-items:center}
.switch input:checked+label{background:var(--ink);color:var(--bg);border-color:var(--ink);font-weight:600}
.switch input:focus-visible+label{outline:3px solid var(--ink);outline-offset:2px}
nav.index{display:flex;flex-wrap:wrap;gap:8px;padding:12px 24px;max-width:1320px;margin:auto}
nav.index a{display:flex;align-items:center;gap:6px;padding:4px 10px 4px 4px;border:1px solid var(--line);border-radius:999px;color:inherit;text-decoration:none;font-size:14px;background:var(--card);flex:none}
nav.index a.looks-link{padding-left:10px;font-weight:600;border-color:var(--ink)}
.mini svg,.mini img{width:22px;height:22px;display:block}
main{max-width:1320px;margin:auto;padding:0 24px 80px}
.group>h2{font:600 28px/1.2 ui-serif,Georgia,serif;margin:48px 0 4px}.group>h2 small{font:500 14px ui-sans-serif,system-ui;color:var(--muted)}.intro{color:var(--muted);margin:0 0 24px;max-width:90ch}
.tool{background:var(--card);border:1px solid var(--line);border-radius:20px;padding:28px;margin:0 0 28px;border-top:6px solid var(--tool-accent)}
.tool header{display:flex;gap:20px;align-items:flex-start}.icon svg,.icon img{width:72px;height:72px;display:block}
.tool h3{margin:0;font-size:26px}.desc{margin:4px 0 8px;color:var(--muted)}.adj{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:0}.adj span{background:var(--bg);border-radius:999px;padding:2px 10px;font-size:13px}.adj code{font-size:12px;color:var(--muted);margin-left:auto}
.identity{display:grid;grid-template-columns:1.4fr 1fr;gap:24px;margin:24px 0}
.specimen{background:var(--bg);border-radius:14px;padding:24px;display:grid;align-content:center;gap:8px}.specimen .big{font-size:clamp(24px,3vw,36px);line-height:1.15;margin:0}.specimen .small{margin:0;color:var(--muted);font-size:15px}
.swatches{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(2,1fr);gap:10px}.swatches li{display:grid;grid-template-columns:44px 1fr;grid-template-rows:auto auto;column-gap:10px;align-items:center}.swatches span{grid-row:span 2;width:44px;height:44px;border-radius:10px;border:1px solid var(--line)}.swatches b{font-size:14px}.swatches code{font-size:12px;color:var(--muted)}
.why{color:var(--muted);max-width:90ch;margin:0 0 20px}
.shots{display:flex;gap:20px;overflow-x:auto;padding-bottom:8px;scroll-snap-type:x mandatory}.shot{margin:0;display:flex;gap:12px;align-items:flex-end;scroll-snap-align:start;flex:none}
.shot img{display:block;border-radius:10px;border:1px solid var(--line);background:var(--bg)}.shot .desktop{height:300px;width:auto}.shot .phone{height:300px;width:auto}.shot figcaption{writing-mode:vertical-rl;transform:rotate(180deg);font-size:12px;color:var(--muted)}
.none{color:var(--muted)}.empty,.public-note{display:none}
/* A look view: only that look's screenshots; the identity block belongs to the "own" and "every" views. */
body:has(#look-chest:checked) .tool .identity,body:has(#look-chest:checked) .tool .why,body:has(#look-sample:checked) .tool .identity,body:has(#look-sample:checked) .tool .why,body:has(#look-port:checked) .tool .identity,body:has(#look-port:checked) .tool .why{display:none}
body:has(#look-chest:checked) .tool header,body:has(#look-sample:checked) .tool header,body:has(#look-port:checked) .tool header{margin-bottom:20px}
body:has(#look-chest:checked) .public-note{display:block;margin:0 0 12px}
${viewCss}
.looks .intro code{font-size:14px}
.look-heads{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin:0 0 16px}
.look-heads span{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:8px 12px;font-size:13px;color:var(--muted);display:grid}.look-heads b{color:inherit;font-size:14px}
.look-row{background:var(--card);border:1px solid var(--line);border-radius:20px;padding:20px;margin:0 0 20px}
.look-row h3{display:flex;align-items:center;gap:8px;margin:0 0 14px;font-size:20px}.look-row h3 small{font:500 13px ui-sans-serif,system-ui;color:var(--muted)}
.cells{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;align-items:start}
.cell{margin:0;border-radius:12px}
.cell figcaption,.cell.gap{font-size:13px;color:var(--muted);display:grid;margin-bottom:6px}.cell figcaption b,.cell.gap b{color:var(--ink);font-size:14px}
.cell img{display:block;width:100%;height:auto;border-radius:10px;border:1px solid var(--line);background:var(--bg)}
.cell.phone img{max-width:200px}
.cell.gap{border:2px dashed var(--line);padding:14px;min-height:140px;align-content:start}.cell.gap p{margin:4px 0 0}
.gaps-title{margin:32px 0 8px;font-size:20px}.gaps{color:var(--muted);max-width:100ch;padding-left:20px}.gaps a{color:var(--ink)}
@media (max-width:760px){.identity{grid-template-columns:1fr}.tool{padding:18px}.icon svg,.icon img{width:52px;height:52px}.shot .desktop,.shot .phone{height:220px}
  .bar{position:static}.look-heads{display:none}.switch{padding:12px 16px 0}.switch legend{float:none;width:100%;margin-bottom:6px}
  nav.index{flex-wrap:nowrap;overflow-x:auto;padding:12px 16px}main{padding:0 16px 64px}.top{padding:40px 16px 20px}
  .cells{grid-template-columns:repeat(2,1fr);gap:12px}.look-row{padding:14px}.adj code{margin-left:0}}
@media (prefers-reduced-motion:no-preference){html{scroll-behavior:smooth}}
</style></head><body>
<div class="top"><h1>The Chest store, side by side</h1><p>${count} tools, each with its own identity — and the same tools in the looks a company can choose. Built by <code>scripts/build-showcase.mjs</code> from each tool's <code>DESIGN.md</code>, <code>docs/screens/</code> and <code>docs/screens.json</code> — ${new Date().toISOString().slice(0, 10)}.</p><p class="top-links"><a href="#looks">Compare the looks, tool by tool</a>${gallery ? `<a class="quiet" href="${escape(gallery)}">See every identity as a theme any tool can wear, and try your own brand →</a>` : ""}</p></div>
<div class="bar">${lookSwitch}
<nav class="index" aria-label="Tools"><a class="looks-link" href="#looks">Looks</a>${index}</nav></div>
<main>${sections}
${looksSection}</main>
</body></html>
`;
writeFileSync(out, html);
console.log(`showcase/index.html: ${count} tools; looks compared, ${gaps.length} tools with a gap`);
for (const g of gaps) console.log(`  ${g.tool}: ${g.items ? g.items.map(i => `${i.look} ${i.text}`).join("; ") : g.text}`);
