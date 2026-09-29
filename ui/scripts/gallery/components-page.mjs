// Builds ui/gallery/components.html: every component of
// @argentic/chest-ui/components, working, in a few looks — the Chest's
// own sheet, two identities of the catalogue (Workshop, Library) and a
// company's brand (derived from two colours) — light and dark, English and
// French; and a side-by-side matrix of the same pieces in all of them.
// The workbench is rendered here with react-dom/server and hydrated in the
// page; the page shows any hydration mismatch. One static file, no network.
//
//   called by build-gallery.mjs (npm run gallery)
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const dist = file => pathToFileURL(join(root, "dist", file)).href;
const { themeOf } = await import(dist("themes.js"));
const { themeCss } = await import(dist("css.js"));
const { deriveTheme } = await import(dist("derive.js"));
const { registry } = await import(dist("fonts.js"));
const esbuild = await import(pathToFileURL(join(root, "node_modules", "esbuild", "lib", "main.js")).href);
const React = await import(pathToFileURL(join(root, "node_modules", "react", "index.js")).href);
const { renderToString, renderToStaticMarkup } = await import(pathToFileURL(join(root, "node_modules", "react-dom", "server.node.js")).href);
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const escape = v => String(v ?? "").replace(/[&<>"']/gu, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const both = (en, fr) => `data-en="${escape(en)}" data-fr="${escape(fr)}"`;
// An element whose words switch with the language (English in the file).
const said = (tag, en, fr, attrs = "") => `<${tag}${attrs ? " " + attrs : ""} ${both(en, fr)}>${escape(en)}</${tag}>`;

// The looks: the portal's sheet, two identities, a brand.
const brand = deriveTheme({ name: "Atelier Martin", primary: "#e4572e", secondary: "#17bebb", display: { id: "young-serif" }, body: { id: "work-sans" }, corners: "round" }).theme;
const looks = [
  { id: "chest", theme: themeOf("chest"), name: ["Chest", "Chest"] },
  { id: "workshop", theme: themeOf("workshop"), name: ["Workshop (Tasks)", "Atelier (Tâches)"] },
  { id: "library", theme: themeOf("library"), name: ["Library (Wiki)", "Bibliothèque (Wiki)"] },
  { id: "instrument", theme: themeOf("instrument"), name: ["Instrument (Timesheets)", "Instrument (Temps)"] },
  { id: "brand", theme: { ...brand, id: "brand" }, name: ["A brand: Atelier Martin", "Une marque : Atelier Martin"] },
];
const lightOnly = t => t.modes === "light";
const themeStyles = looks.map(l => themeCss(l.theme, { selector: `.th-${l.id}-l`, mode: "light", faces: false }) + "\n" + themeCss(l.theme, { selector: `.th-${l.id}-d`, mode: lightOnly(l.theme) ? "light" : "dark", faces: false })).join("\n");

// Only these looks' fonts, latin subsets, inlined.
const wanted = new Set(looks.flatMap(l => [l.theme.fonts.display, l.theme.fonts.body, l.theme.fonts.mono, l.theme.fonts.accent]).filter(f => f && f.id).map(f => f.id));
const faces = [];
for (const entry of registry.values()) {
  if (!wanted.has(entry.id)) continue;
  for (const f of entry.files.filter(f => f.subset === "latin")) {
    const data = readFileSync(join(root, "fonts", f.file));
    faces.push(`@font-face{font-family:'${entry.family}';font-style:${f.style};font-weight:${f.weight};font-display:swap;src:url(data:font/woff2;base64,${data.toString("base64")}) format('woff2');unicode-range:${f.range}}`);
  }
}

// The demos, bundled for Node (server rendering) and for the browser.
const work = mkdtempSync(join(tmpdir(), "chest-ui-gallery-"));
let Workbench, Specimen;
try {
  await esbuild.build({ entryPoints: [join(root, "scripts", "gallery", "demo.jsx")], outfile: join(work, "demo.mjs"), bundle: true, platform: "node", format: "esm", jsx: "automatic", external: ["react", "react/*", "react-dom", "react-dom/*"], nodePaths: [join(root, "node_modules")], logLevel: "warning", absWorkingDir: root });
  // The bundle imports react: resolve it from the kit's node_modules.
  const code = readFileSync(join(work, "demo.mjs"), "utf8").replace(/from "react(\/jsx-runtime)?"/gu, (_, sub) => `from ${JSON.stringify(pathToFileURL(join(root, "node_modules", "react", sub ? "jsx-runtime.js" : "index.js")).href)}`);
  writeFileSync(join(work, "demo.mjs"), code);
  ({ Workbench, Specimen } = await import(pathToFileURL(join(work, "demo.mjs")).href));
} finally {
  rmSync(work, { recursive: true, force: true });
}
const client = await esbuild.build({ entryPoints: [join(root, "scripts", "gallery", "components-client.jsx")], bundle: true, format: "iife", platform: "browser", target: "es2022", minify: true, write: false, jsx: "automatic", legalComments: "none", logLevel: "warning", define: { "process.env.NODE_ENV": '"production"' }, absWorkingDir: root, nodePaths: [join(root, "node_modules")] });
const script = client.outputFiles[0].text.replace(/<\/script/giu, "<\\/script");

const today = new Date().toISOString().slice(0, 10);
const bench = lang => renderToString(React.createElement(Workbench, { lang, today }), { identifierPrefix: `${lang}-` });
const spec = lang => renderToStaticMarkup(React.createElement(Specimen, { lang, today }));
const kitCss = readFileSync(join(root, "css", "components.css"), "utf8");

const matrix = looks.flatMap(l => (lightOnly(l.theme) ? ["l"] : ["l", "d"]).map(m => `
  <figure class="cell">
    <figcaption><b ${both(l.name[0], l.name[1])}>${escape(l.name[0])}</b> <span ${both(m === "l" ? "light" : "dark", m === "l" ? "clair" : "sombre")}>${m === "l" ? "light" : "dark"}</span>${lightOnly(l.theme) ? ` <span ${both("(no dark mode)", "(pas de mode sombre)")}>(no dark mode)</span>` : ""}</figcaption>
    <div class="th-${l.id}-${m} spec-wrap"><div data-lang-block="en">${spec("en")}</div><div data-lang-block="fr" hidden>${spec("fr")}</div></div>
  </figure>`)).join("");

const pageCss = `
:root{--g-bg:#f4f2ee;--g-card:#fff;--g-ink:#1b1a18;--g-muted:#5f5b53;--g-line:#e0dcd3;--g-accent:#3346d3;color-scheme:light dark}
@media (prefers-color-scheme:dark){:root{--g-bg:#121211;--g-card:#1b1b19;--g-ink:#efece6;--g-muted:#a9a498;--g-line:#2f2e2a;--g-accent:#9aa6ff}}
*{box-sizing:border-box}[hidden]{display:none!important}
body{margin:0;background:var(--g-bg);color:var(--g-ink);font:16px/1.55 system-ui,-apple-system,'Segoe UI',sans-serif}
a{color:var(--g-accent)}:focus-visible{outline:3px solid var(--g-accent);outline-offset:2px}
.top{max-width:1360px;margin:0 auto;padding:48px 24px 20px}
.top h1{margin:0;font:600 clamp(34px,5vw,60px)/1 Georgia,serif;letter-spacing:-.02em}
.top p{margin:12px 0 0;max-width:70ch;color:var(--g-muted);font-size:18px}
.controls{position:sticky;top:0;z-index:40;background:color-mix(in oklab,var(--g-bg) 90%,transparent);backdrop-filter:blur(10px);border-bottom:1px solid var(--g-line)}
.controls>div{max-width:1360px;margin:0 auto;padding:10px 24px;display:flex;flex-wrap:wrap;gap:10px 20px;align-items:center}
.seg{display:flex;flex-wrap:wrap;gap:4px;border:1px solid var(--g-line);border-radius:999px;padding:4px;background:var(--g-card)}
.seg button{font:inherit;font-size:14px;border:0;background:none;color:var(--g-ink);border-radius:999px;padding:6px 14px;min-height:36px;cursor:pointer}
.seg button[aria-pressed=true]{background:var(--g-ink);color:var(--g-bg)}.seg button:disabled{opacity:.45;cursor:default}
.seg-label{font-size:13px;color:var(--g-muted);margin-right:-12px}
main{max-width:1360px;margin:0 auto;padding:24px 24px 96px;display:grid;gap:28px}
.hydration{background:#b3261e;color:#fff;padding:12px 16px;border-radius:12px;white-space:pre-wrap;font:14px/1.4 ui-monospace,monospace}
.stage{background:var(--bg);color:var(--ink);font:var(--text-m)/var(--leading) var(--font-body);border-radius:22px;border:1px solid var(--g-line);padding:clamp(12px,3vw,32px)}
.bench{display:grid;gap:clamp(20px,3vw,36px)}
.demo{display:grid;gap:10px;padding-bottom:clamp(20px,3vw,36px);border-bottom:var(--border-width) solid var(--line)}
.demo:last-child{border-bottom:0}
.demo-title{margin:0;font:var(--display-weight) var(--text-xl)/1.2 var(--font-display);letter-spacing:var(--display-tracking)}
.demo-intro{margin:0;color:var(--ink-2);max-width:75ch}
.demo-body{display:grid;gap:16px;margin-top:6px}
.demo-row{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
.demo-note{font:var(--text-xs)/1 var(--font-mono);color:var(--ink-2)}
.demo-row p.demo-note{margin:0}
.demo-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:20px 28px;align-items:start}
.demo-wide{grid-column:1/-1;min-width:0}
.demo-times{display:flex;gap:12px;flex-wrap:wrap}
.demo-stack{display:grid;gap:18px;min-width:0}
.demo-stack-s{display:grid;gap:8px;min-width:0}
.demo-toolbar{display:flex;flex-wrap:wrap;gap:12px 20px;align-items:center;justify-content:space-between}
.demo-sub{margin:8px 0 0;font:var(--display-weight) var(--text-m)/1.3 var(--font-display)}
.demo-frame{border:var(--border-width) solid var(--line-strong);border-radius:var(--radius-l);overflow:hidden;background:var(--bg)}
.demo-frame .ck-shell{min-height:0}.demo-frame .ck-bar{position:static}.demo-frame .ck-main{padding-bottom:var(--space-5)}.demo-frame .ck-page-head{margin:0}
.demo-thumb{display:block;width:100%;height:100%;background:linear-gradient(135deg,var(--cat-6-soft),var(--cat-1))}
.demo-cat-band{display:grid;gap:8px;padding:12px 16px;border-radius:var(--radius-m);background:var(--cat-3-soft);color:var(--cat-3-ink);--ck-filters-ink:var(--cat-3-ink);--ck-filters-link:var(--cat-3-ink)}
.demo-band-count{margin:0;font-size:var(--text-s)}
.demo-band{display:flex;flex-wrap:wrap;align-items:center;gap:8px 20px;padding:0 16px;border-radius:var(--radius-m);background:var(--inverse);color:var(--inverse-ink)}
.demo-band-nav{display:flex;gap:4px}
.demo-band-nav a{display:inline-flex;align-items:center;min-height:44px;padding:0 12px;color:var(--inverse-ink);text-decoration:none;border-bottom:3px solid transparent}
.demo-band-nav a[aria-current="page"]{border-bottom-color:var(--inverse-signal)}
.demo-band-nav a:focus-visible,.demo-band-start:focus-visible{outline:3px solid var(--inverse-ink);outline-offset:2px}
.demo-band-clock{font:var(--text-l)/1 var(--font-mono);color:var(--inverse-signal)}
.demo-band-start{min-height:44px;padding:0 20px;margin-left:auto;border:0;border-radius:var(--radius-m);background:var(--inverse-signal);color:var(--inverse-signal-ink);font:inherit;font-weight:var(--weight-strong);cursor:pointer}
.demo-mark{display:inline-block;width:26px;height:26px;border-radius:var(--radius-s);background:var(--accent);box-shadow:inset 0 0 0 var(--border-width) var(--accent-line)}
.section-title{font:600 clamp(26px,3vw,36px)/1.1 Georgia,serif;margin:12px 0 0}
.section-intro{margin:4px 0 0;color:var(--g-muted);max-width:75ch}
.matrix{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr));gap:16px}
.cell{margin:0;display:grid;gap:6px}.cell figcaption{font-size:14px;color:var(--g-muted)}.cell figcaption b{color:var(--g-ink);font-weight:600}
.spec-wrap{background:var(--bg);color:var(--ink);font:var(--text-m)/var(--leading) var(--font-body);border:1px solid var(--g-line);border-radius:16px;padding:16px}
.spec-k{display:grid;gap:12px}.spec-k .ck-page-head{margin:0;align-items:center}.spec-k .ck-page-title h2{font-size:var(--text-l)}
.spec-toast{justify-self:start;animation:none}.spec-field{display:flex;align-items:center;max-width:12em}
footer{max-width:1360px;margin:0 auto;padding:0 24px 48px;color:var(--g-muted);font-size:14px}
`;

const lookButtons = looks.map(l => `<button type="button" data-theme="${l.id}"${lightOnly(l.theme) ? ' data-light-only="1"' : ""} aria-pressed="${l.id === "workshop"}" ${both(l.name[0], l.name[1])}>${escape(l.name[0])}</button>`).join("");

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Chest components — the store's shared UI</title>
<meta name="description" content="The React components of @argentic/chest-ui: toast with Undo, dialog, people picker, dates, files, table, filters, the app shell — in several looks, light and dark, English and French.">
<style>
${faces.join("\n")}
${themeStyles}
${kitCss}
${pageCss}
</style>
</head><body data-today="${today}">
<div class="top">
  <h1 ${both("Components for Chest tools", "Les composants des outils Chest")}>Components for Chest tools</h1>
  ${said("p", "The pieces every tool of the store shares, working. They wear any look — each tool’s identity, a theme of the catalogue, a company’s brand — because they name only the tokens of the contract. Every word comes from the tool (English and French given).", "Les pièces que partagent tous les outils du store, en fonctionnement. Elles portent n’importe quelle allure — l’identité de chaque outil, un thème du catalogue, la marque d’une entreprise — car elles ne nomment que les jetons du contrat. Chaque mot vient de l’outil (anglais et français fournis).")}
  <p><a href="index.html" ${both("← The themes", "← Les thèmes")}>← The themes</a> · <code>${escape(pkg.name)} ${escape(pkg.version)}</code></p>
</div>
<div class="controls"><div>
  <span class="seg-label" ${both("Look", "Allure")}>Look</span><div class="seg" role="group" aria-label="Look / Allure">${lookButtons}</div>
  <span class="seg-label" ${both("Mode", "Mode")}>Mode</span><div class="seg" role="group" aria-label="Mode"><button type="button" data-mode="l" aria-pressed="true" ${both("Light", "Clair")}>Light</button><button type="button" data-mode="d" aria-pressed="false" ${both("Dark", "Sombre")}>Dark</button></div>
  <span class="seg-label" ${both("Language", "Langue")}>Language</span><div class="seg" role="group" aria-label="Language / Langue"><button type="button" data-lang="en" aria-pressed="true">English</button><button type="button" data-lang="fr" aria-pressed="false">Français</button></div>
</div></div>
<main>
  <pre id="hydration" class="hydration" role="alert" hidden></pre>
  <div id="stage" class="stage th-workshop-l">
    <div id="bench-en" data-lang-block="en">${bench("en")}</div>
    <div id="bench-fr" data-lang-block="fr" hidden>${bench("fr")}</div>
  </div>
  <div><h2 class="section-title" ${both("Side by side", "Côte à côte")}>Side by side</h2>${said("p", "The same pieces in every look shown here, light and dark: states keep a shape and a word, categories a label, every text a measured pair.", "Les mêmes pièces dans chaque allure, en clair et en sombre : les états gardent une forme et un mot, les catégories un libellé, chaque texte une paire mesurée.", 'class="section-intro"')}</div>
  <div class="matrix">${matrix}</div>
</main>
<footer>${said("p", `Built by ui/scripts/build-gallery.mjs from ${pkg.name} ${pkg.version} on ${today}. Rendered on the server, then hydrated. Opens without a network.`, `Construit par ui/scripts/build-gallery.mjs depuis ${pkg.name} ${pkg.version} le ${today}. Rendu sur le serveur, puis hydraté. S’ouvre sans réseau.`)}</footer>
<script>${script}</script>
</body></html>
`;
const out = join(root, "gallery", "components.html");
writeFileSync(out, html);
console.log(`gallery/components.html: ${looks.length} looks, ${faces.length} font faces, ${Math.round(statSync(out).size / 1024)} KiB in all`);
