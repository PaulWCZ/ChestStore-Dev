// The gallery's script (bundled into ui/gallery/index.html by
// build-gallery.mjs): the language switch, and the "Your brand" panel,
// which runs the kit's own derive and import in the page — no network, the
// file a person drops never leaves their computer.
import { themeCss } from "../../dist/css.js";
import { checkTheme } from "../../dist/contract.js";
import { BrandError, deriveTheme } from "../../dist/derive.js";
import { importBrand } from "../../dist/import.js";
import { specimen } from "./specimen.mjs";

const $ = selector => document.querySelector(selector);
let lang = "en";
try { lang = localStorage.getItem("chest-ui-gallery-lang") === "fr" ? "fr" : "en"; } catch { /* private window: English */ }
let imported = [];

function applyLanguage() {
  document.documentElement.lang = lang;
  for (const el of document.querySelectorAll("[data-en]")) el.textContent = el.dataset[lang] ?? el.dataset.en;
  for (const el of document.querySelectorAll("[data-en-label]")) el.setAttribute("aria-label", el.dataset[lang + "Label"] ?? el.dataset.enLabel);
  for (const button of document.querySelectorAll("[data-lang]")) button.setAttribute("aria-pressed", String(button.dataset.lang === lang));
  // Specimens of the catalogue: both languages are in the page.
  for (const el of document.querySelectorAll("[data-lang-block]")) el.hidden = el.dataset.langBlock !== lang;
  render();
}

function brandFromForm() {
  const form = $("#brand-form");
  const data = new FormData(form);
  const pick = name => String(data.get(name) ?? "").trim();
  return {
    name: pick("name"),
    primary: pick("primary-text") || pick("primary"),
    ...(pick("use-secondary") ? { secondary: pick("secondary-text") || pick("secondary") } : {}),
    ...(pick("use-neutral") ? { neutral: pick("neutral-text") || pick("neutral") } : {}),
    display: { id: pick("display") },
    body: { id: pick("body") },
    corners: pick("corners") || "soft",
    density: pick("density") || "comfortable",
  };
}

function render() {
  const out = $("#brand-out");
  if (!out) return;
  let derived;
  try {
    derived = deriveTheme(brandFromForm());
  } catch (error) {
    const message = error instanceof BrandError
      ? { en: "This is not a colour the kit can read: try #1d5b43, rgb(29 91 67) or a name like teal.", fr: "Le kit ne lit pas cette couleur : essayez #1d5b43, rgb(29 91 67) ou un nom comme teal." }[lang]
      : String(error);
    out.innerHTML = `<p class="problem" role="alert">${message.replace(/</gu, "&lt;")}</p>`;
    return;
  }
  const { theme, notes } = derived;
  const css = themeCss(theme, { selector: ".th-brand-l", mode: "light", faces: false }) + "\n" + themeCss(theme, { selector: ".th-brand-d", mode: "dark", faces: false });
  $("#brand-style").textContent = css;
  const failures = checkTheme(theme).length;
  const all = [...imported, ...notes];
  const said = all.length === 0 ? `<li>${{ en: "Nothing had to change: your colours read well as they are.", fr: "Rien n’a dû changer : vos couleurs se lisent bien telles quelles." }[lang]}</li>` : all.map(n => `<li>${n[lang].replace(/</gu, "&lt;")}</li>`).join("");
  out.innerHTML = `<div class="pair">${specimen(theme, "light", "th-brand-l", lang)}${specimen(theme, "dark", "th-brand-d", lang)}</div>
  <div class="verdict ${failures ? "bad" : "good"}"><b>${failures ? { en: `${failures} pairs below AA`, fr: `${failures} paires sous AA` }[lang] : { en: "Every text and control reads (WCAG AA), light and dark.", fr: "Tous les textes et contrôles se lisent (WCAG AA), en clair et en sombre." }[lang]}</b></div>
  <h3 class="notes-title">${{ en: "What the kit did", fr: "Ce que le kit a fait" }[lang]}</h3><ul class="notes">${said}</ul>`;
}

function syncPair(name) {
  const colour = $(`#${name}`), text = $(`#${name}-text`);
  colour.addEventListener("input", () => { text.value = colour.value; imported = []; render(); });
  text.addEventListener("input", () => { if (/^#[0-9a-f]{6}$/iu.test(text.value.trim())) colour.value = text.value.trim().toLowerCase(); imported = []; render(); });
}

function fill(brand) {
  const set = (name, value) => { if (value) { $(`#${name}`).value = value; $(`#${name}-text`).value = value; } };
  set("primary", brand.primary);
  $("#use-secondary").checked = Boolean(brand.secondary);
  set("secondary", brand.secondary);
  $("#use-neutral").checked = Boolean(brand.neutral);
  set("neutral", brand.neutral);
  if (brand.display) $("#display").value = brand.display.id;
  if (brand.body) $("#body").value = brand.body.id;
  if (brand.corners) $(`input[name=corners][value=${brand.corners}]`).checked = true;
}

async function readFile(file) {
  if (!file) return;
  if (file.size > 1 << 20) { imported = importBrand("x".repeat((1 << 20) + 1)).notes; render(); return; }
  const result = importBrand(await file.text(), file.name);
  if (result.brand) fill(result.brand);
  imported = result.notes;
  render();
}

function start() {
  for (const button of document.querySelectorAll("[data-lang]")) button.addEventListener("click", () => {
    lang = button.dataset.lang;
    try { localStorage.setItem("chest-ui-gallery-lang", lang); } catch { /* not kept */ }
    applyLanguage();
  });
  const form = $("#brand-form");
  if (form) {
    syncPair("primary"); syncPair("secondary"); syncPair("neutral");
    form.addEventListener("change", () => render());
    form.addEventListener("submit", event => event.preventDefault());
    $("#brand-file").addEventListener("change", event => readFile(event.target.files[0]));
    const drop = $("#drop");
    drop.addEventListener("dragover", event => { event.preventDefault(); drop.classList.add("over"); });
    drop.addEventListener("dragleave", () => drop.classList.remove("over"));
    drop.addEventListener("drop", event => { event.preventDefault(); drop.classList.remove("over"); readFile(event.dataTransfer.files[0]); });
    $("#sample").addEventListener("click", () => {
      const r = importBrand(document.getElementById("sample-tokens").textContent, "sample.tokens.json");
      if (r.brand) fill(r.brand);
      imported = r.notes;
      render();
    });
  }
  applyLanguage();
}

start();
