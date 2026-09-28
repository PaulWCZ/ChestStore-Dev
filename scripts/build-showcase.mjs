// Builds showcase/index.html: every tool's identity side by side (the style
// contest). One static page that opens with a double-click: no server, no
// network — icons inline, fonts and screenshots by relative paths into
// tools/. Reads each tool's chest.json, DESIGN.md (its ```json showcase
// block) and docs/screens/.
//
//   node scripts/build-showcase.mjs
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "showcase", "index.html");
const escape = v => String(v ?? "").replace(/[&<>"']/gu, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const rel = p => relative(dirname(out), p).split("\\").join("/");

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
  const pairs = [...new Set(screens.map(f => f.replace(/-(desktop|phone)\.png$/u, "")))].map(name => ({
    name,
    desktop: screens.includes(`${name}-desktop.png`) ? rel(join(screensDir, `${name}-desktop.png`)) : null,
    phone: screens.includes(`${name}-phone.png`) ? rel(join(screensDir, `${name}-phone.png`)) : null,
  }));
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

function card(t) {
  const display = fontFamily(t, "display");
  const body = fontFamily(t, "body");
  const swatches = (t.show.colors ?? []).map(c => `<li><span style="background:${escape(c.value)}"></span><b>${escape(c.name)}</b><code>${escape(c.value)}</code></li>`).join("");
  const shots = t.pairs.map((p, i) => `<figure class="shot${i === 0 ? " first" : ""}">${p.desktop ? `<a href="${escape(p.desktop)}"><img loading="lazy" class="desktop" src="${escape(p.desktop)}" alt="${escape(t.manifest.title)} — ${escape(p.name)}, desktop"></a>` : ""}${p.phone ? `<a href="${escape(p.phone)}"><img loading="lazy" class="phone" src="${escape(p.phone)}" alt="${escape(t.manifest.title)} — ${escape(p.name)}, phone"></a>` : ""}<figcaption>${escape(p.name)}</figcaption></figure>`).join("");
  const accent = t.show.colors?.[2]?.value ?? t.show.colors?.[0]?.value ?? "#888";
  return `<article class="tool" id="${escape(t.manifest.name)}" style="--tool-accent:${escape(accent)}">
  <header>
    <div class="icon" aria-hidden="true">${t.icon}</div>
    <div><h3>${escape(t.manifest.title ?? t.manifest.name)}</h3><p class="desc">${escape(t.manifest.description ?? "")}</p>
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
  <div class="shots">${shots || '<p class="none">No screenshots yet.</p>'}</div>
</article>`;
}

const sections = groups.map(g => `<section class="group"><h2>${escape(g.title)} <small>${g.tools.length}</small></h2><p class="intro">${escape(g.intro)}</p>${g.tools.map(card).join("\n") || '<p class="none">None yet.</p>'}</section>`).join("\n");
const count = groups.reduce((n, g) => n + g.tools.length, 0);
const index = groups.flatMap(g => g.tools).map(t => `<a href="#${escape(t.manifest.name)}"><span class="mini" aria-hidden="true">${t.icon}</span>${escape(t.manifest.title ?? t.manifest.name)}</a>`).join("");

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Chest store — the style contest</title>
<style>
${faces.join("\n")}
:root{--bg:#f3f1ec;--ink:#1d1c1a;--muted:#6b675f;--card:#fff;--line:#e2ded5}
@media (prefers-color-scheme:dark){:root{--bg:#141412;--ink:#eeebe4;--muted:#a19c91;--card:#1d1c1a;--line:#302e2a}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
.top{padding:56px 24px 24px;max-width:1320px;margin:auto}.top h1{font:600 clamp(32px,5vw,56px)/1.05 ui-serif,Georgia,serif;margin:0 0 12px;letter-spacing:-.02em}.top p{color:var(--muted);max-width:60ch;margin:0}
nav.index{display:flex;flex-wrap:wrap;gap:8px;padding:16px 24px;max-width:1320px;margin:auto;position:sticky;top:0;background:color-mix(in srgb,var(--bg) 92%,transparent);backdrop-filter:blur(8px);z-index:2;border-bottom:1px solid var(--line)}
nav.index a{display:flex;align-items:center;gap:6px;padding:4px 10px 4px 4px;border:1px solid var(--line);border-radius:999px;color:inherit;text-decoration:none;font-size:14px;background:var(--card)}
.mini svg,.mini img{width:22px;height:22px;display:block}
main{max-width:1320px;margin:auto;padding:0 24px 80px}
.group>h2{font:600 28px/1.2 ui-serif,Georgia,serif;margin:48px 0 4px}.group>h2 small{font:500 14px ui-sans-serif,system-ui;color:var(--muted)}.intro{color:var(--muted);margin:0 0 24px}
.tool{background:var(--card);border:1px solid var(--line);border-radius:20px;padding:28px;margin:0 0 28px;border-top:6px solid var(--tool-accent)}
.tool header{display:flex;gap:20px;align-items:flex-start}.icon svg,.icon img{width:72px;height:72px;display:block}
.tool h3{margin:0;font-size:26px}.desc{margin:4px 0 8px;color:var(--muted)}.adj{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:0}.adj span{background:var(--bg);border-radius:999px;padding:2px 10px;font-size:13px}.adj code{font-size:12px;color:var(--muted);margin-left:auto}
.identity{display:grid;grid-template-columns:1.4fr 1fr;gap:24px;margin:24px 0}
.specimen{background:var(--bg);border-radius:14px;padding:24px;display:grid;align-content:center;gap:8px}.specimen .big{font-size:clamp(24px,3vw,36px);line-height:1.15;margin:0}.specimen .small{margin:0;color:var(--muted);font-size:15px}
.swatches{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(2,1fr);gap:10px}.swatches li{display:grid;grid-template-columns:44px 1fr;grid-template-rows:auto auto;column-gap:10px;align-items:center}.swatches span{grid-row:span 2;width:44px;height:44px;border-radius:10px;border:1px solid var(--line)}.swatches b{font-size:14px}.swatches code{font-size:12px;color:var(--muted)}
.why{color:var(--muted);max-width:90ch;margin:0 0 20px}
.shots{display:flex;gap:20px;overflow-x:auto;padding-bottom:8px;scroll-snap-type:x mandatory}.shot{margin:0;display:flex;gap:12px;align-items:flex-end;scroll-snap-align:start;flex:none}
.shot img{display:block;border-radius:10px;border:1px solid var(--line);background:var(--bg)}.shot .desktop{height:300px;width:auto}.shot .phone{height:300px;width:auto}.shot figcaption{writing-mode:vertical-rl;transform:rotate(180deg);font-size:12px;color:var(--muted)}
.none{color:var(--muted)}
@media (max-width:760px){.identity{grid-template-columns:1fr}.tool{padding:18px}.icon svg,.icon img{width:52px;height:52px}.shot .desktop,.shot .phone{height:220px}}
</style></head><body>
<div class="top"><h1>The Chest store, side by side</h1><p>${count} tools, each with its own identity. Built by <code>scripts/build-showcase.mjs</code> from each tool's <code>DESIGN.md</code> and <code>docs/screens/</code> — ${new Date().toISOString().slice(0, 10)}.</p></div>
<nav class="index" aria-label="Tools">${index}</nav>
<main>${sections}</main>
</body></html>
`;
writeFileSync(out, html);
console.log(`showcase/index.html: ${count} tools`);
