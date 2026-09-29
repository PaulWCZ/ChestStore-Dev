// Builds ui/gallery/index.html (and ui/gallery/components.html, below): every theme of the catalogue side by side,
// light and dark, as the same small screen of a tool; and "Your brand", a
// panel where one types colours or drops a tokens/CSS file and sees the
// derived theme with what the kit adjusted. One static file that opens with
// a double-click: fonts inlined (latin subsets), the kit's derive and
// import bundled in, no network.
//
//   npm run gallery          (npm run build && node scripts/build-gallery.mjs)
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { specimen, specimenCss } from "./gallery/specimen.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = file => pathToFileURL(join(root, "dist", file)).href;
const { catalogue } = await import(dist("themes.js"));
const { themeCss } = await import(dist("css.js"));
const { ratios, checkTheme } = await import(dist("contract.js"));
const { registry } = await import(dist("fonts.js"));
const esbuild = await import(pathToFileURL(join(root, "node_modules", "esbuild", "lib", "main.js")).href);
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const escape = v => String(v ?? "").replace(/[&<>"']/gu, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const both = (en, fr) => `data-en="${escape(en)}" data-fr="${escape(fr)}"`;

// The kit's fonts, inlined: latin subsets (French included), every style.
const faces = [];
let fontBytes = 0;
for (const entry of registry.values()) {
  for (const f of entry.files.filter(f => f.subset === "latin")) {
    const data = readFileSync(join(root, "fonts", f.file));
    fontBytes += data.length;
    faces.push(`@font-face{font-family:'${entry.family}';font-style:${f.style};font-weight:${f.weight};font-display:swap;src:url(data:font/woff2;base64,${data.toString("base64")}) format('woff2');unicode-range:${f.range}}`);
  }
}

// Each theme's tokens on its own classes, one per mode.
const themeStyles = catalogue.map(t => themeCss(t, { selector: `.th-${t.id}-l`, mode: "light", faces: false }) + "\n" + themeCss(t, { selector: `.th-${t.id}-d`, mode: "dark", faces: false })).join("\n");

const fontName = spec => (spec.id ? registry.get(spec.id).family.replace(/ Variable$/u, "") : spec.family || "system");
const tools = { tasks: ["Tasks", "Tâches"], wiki: ["Wiki", "Wiki"], leave: ["Leave", "Congés"], news: ["News", "Actualités"], people: ["People", "Équipe"], crm: ["Clients", "Clients"], expenses: ["Expenses", "Notes de frais"], helpdesk: ["Support", "Support"], rooms: ["Rooms", "Salles"], timesheets: ["Timesheets", "Temps"], booking: ["Booking", "Rendez-vous"], hiring: ["Hiring", "Recrutement"], equipment: ["Equipment", "Matériel"], polls: ["Polls", "Sondages"], goals: ["Goals", "Objectifs"], quotes: ["Quotes & invoices", "Devis et factures"], status: ["Status", "État des services"], forms: ["Forms", "Formulaires"] };

function card(t) {
  const lowest = Math.min(...ratios(t.light).filter(r => r.min === 4.5).map(r => r.ratio), ...(t.modes === "light" ? [] : ratios(t.dark).filter(r => r.min === 4.5).map(r => r.ratio)));
  const failures = checkTheme(t).length;
  const origin = t.tool ? `<span class="tag" ${both(`Identity of ${tools[t.tool][0]}`, `Identité de ${tools[t.tool][1]}`)}>Identity of ${escape(tools[t.tool][0])}</span>` : `<span class="tag" ${both("For every tool", "Pour tous les outils")}>For every tool</span>`;
  const light = t.modes === "light" ? `<span class="tag warn" ${both("Light only", "Clair uniquement")}>Light only</span>` : "";
  const fonts = [...new Set([fontName(t.fonts.display), fontName(t.fonts.body), fontName(t.fonts.read ?? t.fonts.body)])].join(" + ");
  const specs = lang => `<div class="pair" data-lang-block="${lang}"${lang === "en" ? "" : " hidden"}>${specimen(t, "light", `th-${t.id}-l`, lang)}${t.modes === "light" ? `<div class="nodark"><p ${both("No dark mode: the portal’s sheet has none. Pages stay light when the computer is dark.", "Pas de mode sombre : la charte du portail n’en a pas. Les pages restent claires quand l’ordinateur est en sombre.")}>No dark mode: the portal’s sheet has none. Pages stay light when the computer is dark.</p></div>` : specimen(t, "dark", `th-${t.id}-d`, lang)}</div>`;
  return `<article class="theme" id="${t.id}">
  <header class="th-head th-${t.id}-l">
    <div>
      <h2 class="th-name" ${both(t.name.en, t.name.fr)}>${escape(t.name.en)}</h2>
      <p class="th-desc" ${both(t.description.en, t.description.fr)}>${escape(t.description.en)}</p>
    </div>
    <div class="th-meta">${origin}${light}<span class="tag">${escape(fonts)}</span><span class="tag ${failures ? "warn" : "good"}" title="lowest text contrast">AA · ${lowest.toFixed(1)}:1</span><code>${t.id}</code></div>
  </header>
  ${specs("en")}${specs("fr")}
</article>`;
}

// The brand panel's font choices: the registry, by kind.
const fontOptions = selected => [...registry.values()].sort((a, b) => a.family.localeCompare(b.family)).map(e => `<option value="${e.id}"${e.id === selected ? " selected" : ""}>${escape(e.family.replace(/ Variable$/u, ""))} — ${escape(e.category)}</option>`).join("");
const sampleTokens = readFileSync(join(root, "test", "fixtures", "dtcg.tokens.json"), "utf8");

const bundle = await esbuild.build({ entryPoints: [join(root, "scripts", "gallery", "client.mjs")], bundle: true, format: "iife", platform: "browser", target: "es2022", minify: true, write: false, legalComments: "none", logLevel: "warning" });
const script = bundle.outputFiles[0].text.replace(/<\/script/giu, "<\\/script");

const nav = catalogue.map(t => `<a href="#${t.id}" class="th-${t.id}-l"><i></i><span ${both(t.name.en, t.name.fr)}>${escape(t.name.en)}</span></a>`).join("");

const pageCss = `
:root{--g-bg:#f4f2ee;--g-card:#fff;--g-ink:#1b1a18;--g-muted:#5f5b53;--g-line:#e0dcd3;--g-accent:#3346d3;color-scheme:light dark}
@media (prefers-color-scheme:dark){:root{--g-bg:#121211;--g-card:#1b1b19;--g-ink:#efece6;--g-muted:#a9a498;--g-line:#2f2e2a;--g-accent:#9aa6ff}}
*{box-sizing:border-box}[hidden]{display:none!important}html{scroll-behavior:smooth}@media (prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
body{margin:0;background:var(--g-bg);color:var(--g-ink);font:16px/1.55 'Inter Variable',system-ui,-apple-system,'Segoe UI',sans-serif;-webkit-font-smoothing:antialiased}
a{color:var(--g-accent)}:focus-visible{outline:3px solid var(--g-accent);outline-offset:2px}
.top{max-width:1360px;margin:0 auto;padding:64px 24px 28px;display:grid;grid-template-columns:1fr auto;gap:24px;align-items:end}
.top h1{margin:0;font:600 clamp(40px,6vw,76px)/.98 'Fraunces Variable',Georgia,serif;letter-spacing:-.03em;font-variation-settings:'SOFT' 50}
.top p{margin:14px 0 0;max-width:62ch;color:var(--g-muted);font-size:18px}
.facts{display:flex;flex-wrap:wrap;gap:8px;margin-top:18px}.facts span{border:1px solid var(--g-line);background:var(--g-card);border-radius:999px;padding:3px 12px;font-size:14px}
.langs{display:flex;gap:4px;border:1px solid var(--g-line);border-radius:999px;padding:4px;background:var(--g-card)}
.langs button{font:inherit;font-size:14px;border:0;background:none;color:var(--g-ink);border-radius:999px;padding:6px 14px;min-height:36px;cursor:pointer}.langs button[aria-pressed=true]{background:var(--g-ink);color:var(--g-bg)}
nav.index{position:sticky;top:0;z-index:5;background:color-mix(in oklab,var(--g-bg) 88%,transparent);backdrop-filter:blur(10px);border-bottom:1px solid var(--g-line)}
nav.index div{max-width:1360px;margin:0 auto;padding:10px 24px;display:flex;gap:6px;overflow-x:auto;scrollbar-width:thin}
nav.index a{flex:none;display:flex;align-items:center;gap:7px;padding:5px 12px 5px 6px;border-radius:999px;background:var(--g-card);border:1px solid var(--g-line);color:var(--g-ink);text-decoration:none;font-size:14px;white-space:nowrap}
nav.index a i{width:18px;height:18px;border-radius:999px;background:var(--accent);box-shadow:inset 0 0 0 1.5px var(--accent-line),0 0 0 2px var(--bg)}
nav.index a.brand-link{background:var(--g-ink);color:var(--g-bg);border-color:var(--g-ink)}
main{max-width:1360px;margin:0 auto;padding:28px 24px 96px;display:grid;gap:36px}
.section-title{font:600 clamp(28px,3.4vw,40px)/1.1 'Fraunces Variable',Georgia,serif;letter-spacing:-.02em;margin:24px 0 0}
.section-intro{margin:6px 0 0;color:var(--g-muted);max-width:75ch}
.theme{background:var(--g-card);border:1px solid var(--g-line);border-radius:22px;padding:14px;display:grid;gap:14px;scroll-margin-top:70px}
.th-head{display:flex;flex-wrap:wrap;justify-content:space-between;gap:12px 24px;align-items:flex-end;padding:18px 20px;border-radius:14px;background:var(--bg);color:var(--ink)}
.th-name{margin:0;font:var(--display-weight) clamp(28px,3vw,38px)/1.05 var(--font-display);letter-spacing:var(--display-tracking);color:var(--ink)}
.th-desc{margin:6px 0 0;color:var(--ink-2);font-family:var(--font-body);max-width:60ch}
.th-meta{display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-family:var(--font-body)}
.tag{font-size:13px;padding:2px 10px;border-radius:var(--radius-pill);background:var(--surface);color:var(--ink);border:1px solid var(--line)}
.tag.good{background:var(--ok-soft);color:var(--ok-ink);border-color:transparent}.tag.warn{background:var(--wait-soft);color:var(--wait-ink);border-color:transparent}
.th-meta code{font-size:12px;color:var(--ink-2)}
.pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
.nodark{display:grid;place-items:center;border:1px dashed var(--g-line);border-radius:14px;padding:24px;color:var(--g-muted);text-align:center}.nodark p{max-width:34ch;margin:0}
.brand{background:var(--g-card);border:1px solid var(--g-line);border-radius:22px;padding:24px;display:grid;grid-template-columns:minmax(280px,360px) minmax(0,1fr);gap:28px;scroll-margin-top:70px}
.brand form{display:grid;gap:14px;align-content:start}
.brand fieldset{border:0;padding:0;margin:0;display:grid;gap:6px}.brand legend,.brand .lbl{font-weight:600;font-size:14px;padding:0;margin-bottom:4px}
.colour{display:flex;gap:8px;align-items:center}.colour input[type=color]{width:48px;height:44px;border:1px solid var(--g-line);border-radius:10px;background:none;padding:3px;flex:none}
.brand input[type=text],.brand select{font:inherit;min-height:44px;padding:0 12px;border:1px solid color-mix(in oklab,var(--g-ink) 45%,transparent);border-radius:10px;background:var(--g-bg);color:var(--g-ink);width:100%}
.radios{display:flex;flex-wrap:wrap;gap:6px}.radios label{display:flex;align-items:center;gap:6px;border:1px solid var(--g-line);border-radius:999px;padding:6px 12px;min-height:40px;font-size:14px;cursor:pointer}
.check{display:flex;align-items:center;gap:8px;font-weight:600;font-size:14px}.check input{width:18px;height:18px}
.drop{border:2px dashed color-mix(in oklab,var(--g-ink) 35%,transparent);border-radius:14px;padding:16px;text-align:center;display:grid;gap:8px;color:var(--g-muted)}.drop.over{border-color:var(--g-accent);background:color-mix(in oklab,var(--g-accent) 8%,transparent)}
.drop label{color:var(--g-accent);font-weight:600;cursor:pointer;text-decoration:underline}.drop input{position:absolute;width:1px;height:1px;opacity:0}
.btn-sample{font:inherit;font-size:14px;min-height:40px;border:1px solid var(--g-line);background:var(--g-bg);color:var(--g-ink);border-radius:999px;padding:0 14px;cursor:pointer}
#brand-out{display:grid;gap:14px;align-content:start;min-width:0}
.verdict{border-radius:12px;padding:10px 14px;font-size:15px}.verdict.good{background:color-mix(in oklab,#1f8a4c 14%,var(--g-card))}.verdict.bad{background:color-mix(in oklab,#c0392b 16%,var(--g-card))}
.notes-title{margin:6px 0 0;font-size:16px}.notes{margin:0;padding-left:20px;display:grid;gap:4px;color:var(--g-ink)}
.problem{background:color-mix(in oklab,#c0392b 14%,var(--g-card));padding:12px 14px;border-radius:12px}
.fonts{columns:3 260px;column-gap:28px;padding:0;list-style:none;margin:0}.fonts li{break-inside:avoid;padding:6px 0;border-bottom:1px solid var(--g-line);font-size:14px;display:flex;justify-content:space-between;gap:8px}.fonts li span{color:var(--g-muted)}
footer{max-width:1360px;margin:0 auto;padding:0 24px 48px;color:var(--g-muted);font-size:14px}
@media (max-width:900px){.pair{grid-template-columns:1fr}.brand{grid-template-columns:1fr}.top{grid-template-columns:1fr}}
`;

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Chest themes — the catalogue and your brand</title>
<meta name="description" content="Every theme of @argentic/chest-ui side by side, light and dark, and a brand theme derived from your colours.">
<style>
${faces.join("\n")}
${themeStyles}
${specimenCss}
${pageCss}
</style>
<style id="brand-style"></style>
</head><body>
<a id="top"></a>
<div class="top">
  <div>
    <h1 ${both("Themes for Chest tools", "Les thèmes des outils Chest")}>Themes for Chest tools</h1>
    <p ${both("Each company chooses how its tools look: every tool keeps its own identity, or one theme for all, or its own brand. Same features, only the look changes — and every text stays readable.", "Chaque entreprise choisit l’allure de ses outils : chacun garde son identité, ou un thème pour tous, ou sa propre marque. Mêmes fonctions, seule l’allure change — et chaque texte reste lisible.")}>Each company chooses how its tools look: every tool keeps its own identity, or one theme for all, or its own brand. Same features, only the look changes — and every text stays readable.</p>
    <div class="facts"><span ${both(`${catalogue.length} themes`, `${catalogue.length} thèmes`)}>${catalogue.length} themes</span><span ${both("Every pair checked: WCAG AA, light and dark", "Chaque paire vérifiée : WCAG AA, clair et sombre")}>Every pair checked: WCAG AA, light and dark</span><span ${both(`${registry.size} open-licence fonts`, `${registry.size} polices sous licence libre`)}>${registry.size} open-licence fonts</span><span>${escape(pkg.name)} ${escape(pkg.version)}</span><a href="components.html" ${both("The components →", "Les composants →")}>The components →</a></div>
  </div>
  <div class="langs" role="group" aria-label="Language / Langue"><button type="button" data-lang="en" aria-pressed="true">English</button><button type="button" data-lang="fr" aria-pressed="false">Français</button></div>
</div>
<nav class="index" aria-label="Themes" data-en-label="Themes" data-fr-label="Thèmes"><div>${nav}<a href="#your-brand" class="brand-link"><span ${both("Your brand →", "Votre marque →")}>Your brand →</span></a></div></nav>
<main>
  <div><h2 class="section-title" ${both("The catalogue", "Le catalogue")}>The catalogue</h2><p class="section-intro" ${both("The eighteen identities of the store’s tools, the Chest portal’s own look and high contrast. Any tool can wear any of them: the owner picks one for all tools, or one per tool.", "Les dix-huit identités des outils du store, le style du portail Chest et le contraste élevé. Chaque outil peut porter chacun d’eux : le propriétaire en choisit un pour tous les outils, ou un par outil.")}>The eighteen identities of the store’s tools, the Chest portal’s own look and high contrast. Any tool can wear any of them: the owner picks one for all tools, or one per tool.</p></div>
  ${catalogue.map(card).join("\n  ")}
  <div><h2 class="section-title" id="your-brand-title" ${both("Your brand", "Votre marque")}>Your brand</h2><p class="section-intro" ${both("Type your colours or drop your brand file (design tokens .json, Figma Tokens Studio .json, a .css file or a list of colours). The kit makes a full theme, light and dark, and says what it had to adjust so everything stays readable. Nothing leaves this page.", "Tapez vos couleurs ou déposez votre fichier de marque (design tokens .json, Tokens Studio de Figma .json, un fichier .css ou une liste de couleurs). Le kit crée un thème complet, clair et sombre, et dit ce qu’il a dû ajuster pour que tout reste lisible. Rien ne quitte cette page.")}>Type your colours or drop your brand file (design tokens .json, Figma Tokens Studio .json, a .css file or a list of colours). The kit makes a full theme, light and dark, and says what it had to adjust so everything stays readable. Nothing leaves this page.</p></div>
  <section class="brand" id="your-brand" aria-labelledby="your-brand-title">
    <form id="brand-form" autocomplete="off">
      <div class="drop" id="drop"><span ${both("Drop a brand file here", "Déposez un fichier de marque ici")}>Drop a brand file here</span><label for="brand-file" ${both("or choose a file", "ou choisissez un fichier")}>or choose a file</label><input type="file" id="brand-file" accept=".json,.css,.txt,.scss,application/json,text/css,text/plain"><button type="button" class="btn-sample" id="sample" ${both("Try a sample file", "Essayer un fichier d’exemple")}>Try a sample file</button></div>
      <fieldset><legend ${both("Company name", "Nom de l’entreprise")}>Company name</legend><input type="text" name="name" value="Atelier Martin" aria-label="Company name / Nom de l’entreprise"></fieldset>
      <fieldset><legend ${both("Main colour", "Couleur principale")}>Main colour</legend><div class="colour"><input type="color" id="primary" name="primary" value="#e4572e" aria-label="Main colour / Couleur principale"><input type="text" id="primary-text" name="primary-text" value="#e4572e" aria-label="Main colour, as text / Couleur principale, en texte"></div></fieldset>
      <fieldset><label class="check"><input type="checkbox" id="use-secondary" name="use-secondary" value="1" checked><span ${both("Second colour", "Deuxième couleur")}>Second colour</span></label><div class="colour"><input type="color" id="secondary" name="secondary" value="#17bebb" aria-label="Second colour / Deuxième couleur"><input type="text" id="secondary-text" name="secondary-text" value="#17bebb" aria-label="Second colour, as text / Deuxième couleur, en texte"></div></fieldset>
      <fieldset><label class="check"><input type="checkbox" id="use-neutral" name="use-neutral" value="1"><span ${both("Grey tint", "Teinte des gris")}>Grey tint</span></label><div class="colour"><input type="color" id="neutral" name="neutral" value="#6b6358" aria-label="Grey tint / Teinte des gris"><input type="text" id="neutral-text" name="neutral-text" value="#6b6358" aria-label="Grey tint, as text / Teinte des gris, en texte"></div></fieldset>
      <fieldset><legend ${both("Headings font", "Police des titres")}>Headings font</legend><select id="display" name="display" aria-label="Headings font / Police des titres">${fontOptions("fraunces")}</select></fieldset>
      <fieldset><legend ${both("Text font", "Police du texte")}>Text font</legend><select id="body" name="body" aria-label="Text font / Police du texte">${fontOptions("inter")}</select></fieldset>
      <fieldset><legend ${both("Corners", "Coins")}>Corners</legend><div class="radios"><label><input type="radio" name="corners" value="sharp"><span ${both("Sharp", "Droits")}>Sharp</span></label><label><input type="radio" name="corners" value="soft" checked><span ${both("Soft", "Adoucis")}>Soft</span></label><label><input type="radio" name="corners" value="round"><span ${both("Round", "Arrondis")}>Round</span></label></div></fieldset>
      <fieldset><legend ${both("Density", "Densité")}>Density</legend><div class="radios"><label><input type="radio" name="density" value="comfortable" checked><span ${both("Comfortable", "Confortable")}>Comfortable</span></label><label><input type="radio" name="density" value="compact"><span ${both("Compact", "Compacte")}>Compact</span></label></div></fieldset>
    </form>
    <div id="brand-out" aria-live="polite"></div>
  </section>
  <div><h2 class="section-title" ${both("The fonts", "Les polices")}>The fonts</h2><p class="section-intro" ${both("All under the SIL Open Font License 1.1, from Fontsource. The Chest serves them to the tools of a company that chose a theme; each licence travels with its files.", "Toutes sous licence SIL Open Font 1.1, depuis Fontsource. Le Chest les sert aux outils d’une entreprise qui a choisi un thème ; chaque licence accompagne ses fichiers.")}>All under the SIL Open Font License 1.1, from Fontsource. The Chest serves them to the tools of a company that chose a theme; each licence travels with its files.</p></div>
  <ul class="fonts">${[...registry.values()].map(e => `<li style="font-family:'${e.family}',${e.fallback}"><b>${escape(e.family.replace(/ Variable$/u, ""))}</b><span>${escape(e.category)} · ${escape(e.licence)}</span></li>`).join("")}</ul>
</main>
<footer><p ${both(`Built by ui/scripts/build-gallery.mjs from ${pkg.name} ${pkg.version} on ${new Date().toISOString().slice(0, 10)}. Opens without a network.`, `Construit par ui/scripts/build-gallery.mjs depuis ${pkg.name} ${pkg.version} le ${new Date().toISOString().slice(0, 10)}. S’ouvre sans réseau.`)}>Built by ui/scripts/build-gallery.mjs from ${escape(pkg.name)} ${escape(pkg.version)} on ${new Date().toISOString().slice(0, 10)}. Opens without a network.</p></footer>
<script type="application/json" id="sample-tokens">${sampleTokens.replace(/</gu, "\\u003c")}</script>
<script>${script}</script>
</body></html>
`;
const out = join(root, "gallery", "index.html");
writeFileSync(out, html);
// The second page: the components, in a few looks (gallery/components-page.mjs).
await import("./gallery/components-page.mjs");
console.log(`gallery/index.html: ${catalogue.length} themes, ${faces.length} font faces (${Math.round(fontBytes / 1024)} KiB), ${Math.round(statSync(out).size / 1024)} KiB in all`);
