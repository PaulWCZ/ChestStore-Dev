// The components gallery's script: hydrates the server-rendered workbench
// (English and French, each its own root) and runs the controls (theme,
// light or dark, language). A hydration mismatch — the thing Next.js
// reports as error 418 — is shown at the top of the page, in red, and kept
// in window.__hydration for the build's browser check.
import { hydrateRoot } from "react-dom/client";
import { Workbench } from "./demo.jsx";

window.__hydration = [];
const report = (lang, error) => {
  window.__hydration.push(`${lang}: ${String(error?.message ?? error)}`);
  const box = document.getElementById("hydration");
  box.hidden = false;
  box.textContent = window.__hydration.join("\n");
};

const today = document.body.dataset.today;
for (const lang of ["en", "fr"]) {
  const el = document.getElementById(`bench-${lang}`);
  hydrateRoot(el, <Workbench lang={lang} today={today} />, { identifierPrefix: `${lang}-`, onRecoverableError: error => report(lang, error) });
}

const state = { theme: "workshop", mode: "l", lang: "en" };
try {
  const saved = JSON.parse(localStorage.getItem("chest-ui-components") ?? "{}");
  Object.assign(state, Object.fromEntries(Object.entries(saved).filter(([k, v]) => k in state && typeof v === "string")));
} catch { /* private window: the defaults */ }

function apply() {
  const stage = document.getElementById("stage");
  const light = document.querySelector(`[data-theme="${state.theme}"]`)?.dataset.lightOnly === "1";
  const mode = light ? "l" : state.mode;
  stage.className = `stage th-${state.theme}-${mode}`;
  document.documentElement.lang = state.lang;
  for (const el of document.querySelectorAll("[data-lang-block]")) el.hidden = el.dataset.langBlock !== state.lang;
  for (const el of document.querySelectorAll("[data-en]")) el.textContent = el.dataset[state.lang] ?? el.dataset.en;
  for (const b of document.querySelectorAll("[data-theme]")) b.setAttribute("aria-pressed", String(b.dataset.theme === state.theme));
  for (const b of document.querySelectorAll("[data-mode]")) { b.setAttribute("aria-pressed", String(b.dataset.mode === mode)); b.disabled = light; }
  for (const b of document.querySelectorAll("[data-lang]")) b.setAttribute("aria-pressed", String(b.dataset.lang === state.lang));
  try { localStorage.setItem("chest-ui-components", JSON.stringify(state)); } catch { /* not kept */ }
}

document.addEventListener("click", e => {
  const b = e.target.closest?.("[data-theme], [data-mode], [data-lang]");
  if (!b) return;
  if (b.dataset.theme) state.theme = b.dataset.theme;
  if (b.dataset.mode) state.mode = b.dataset.mode;
  if (b.dataset.lang) state.lang = b.dataset.lang;
  apply();
});
apply();
