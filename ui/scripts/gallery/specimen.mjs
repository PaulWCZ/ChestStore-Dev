// A theme's specimen, as the gallery shows it: the same small screen of a
// tool (a header in the theme's band of its own colour, --inverse, a
// heading, a lead in the reading face, a button and its quiet sibling, a link, a
// field, three states, the eight categories, the palette) in one mode.
// Shared by the gallery's build (Node) and its "Your brand" panel (the
// browser), so both draw exactly the same thing.

export const words = {
  en: {
    app: "Planner", who: "Camille", heading: "This week’s plan", lead: "Three tasks are due before Friday. Ask for help early.",
    primary: "Add a task", quiet: "Cancel", link: "Open the board", field: "Task", value: "Call Inès about the order",
    ok: "Approved", wait: "Waiting", danger: "Refused", mark: "Due today",
    cats: ["Holiday", "Training", "Travel", "Remote", "Sick", "Client", "Event", "Other"],
    figures: "Total € 1 234,50 · 09:30–17:00",
    swatches: { bg: "page", surface: "surface", "surface-2": "quiet fill", ink: "text", "ink-2": "secondary", accent: "action", "accent-text": "link", focus: "focus", inverse: "band", highlight: "marker" },
  },
  fr: {
    app: "Planning", who: "Camille", heading: "Le plan de la semaine", lead: "Trois tâches sont à rendre avant vendredi. Demandez de l’aide tôt.",
    primary: "Ajouter une tâche", quiet: "Annuler", link: "Ouvrir le tableau", field: "Tâche", value: "Appeler Inès pour la commande",
    ok: "Approuvé", wait: "En attente", danger: "Refusé", mark: "À rendre aujourd’hui",
    cats: ["Congés", "Formation", "Déplacement", "Télétravail", "Maladie", "Client", "Événement", "Autre"],
    figures: "Total 1 234,50 € · 09:30–17:00",
    swatches: { bg: "page", surface: "surface", "surface-2": "fond discret", ink: "texte", "ink-2": "secondaire", accent: "action", "accent-text": "lien", focus: "focus", inverse: "bandeau", highlight: "surligneur" },
  },
};

const escape = value => String(value ?? "").replace(/[&<>"']/gu, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// scope: the class the theme's tokens are set on (themeCss's selector).
export function specimen(theme, mode, scope, lang = "en") {
  const w = words[lang] ?? words.en;
  const scheme = mode === "dark" && theme.modes !== "light" ? theme.dark : theme.light;
  const swatches = Object.entries(w.swatches).map(([token, label]) => `<li><span style="background:var(--${token})"></span><b>${escape(label)}</b><code>${escape(scheme[token])}</code></li>`).join("");
  const cats = w.cats.map((name, i) => `<span class="cat" style="background:var(--cat-${i + 1}-soft);color:var(--cat-${i + 1}-ink)"><i style="background:var(--cat-${i + 1})"></i>${escape(name)}</span>`).join("");
  return `<div class="spec ${scope}" data-mode="${mode}">
  <div class="s-bar"><span class="s-mark" aria-hidden="true"></span><b class="s-app">${escape(w.app)}</b><span class="s-who">${escape(w.who)}<span class="s-avatar" aria-hidden="true">CM</span></span></div>
  <div class="s-body">
    <h3 class="s-h">${escape(w.heading)}</h3>
    <p class="s-lead">${escape(w.lead)} <mark class="s-mk">${escape(w.mark)}</mark></p>
    <div class="s-card">
      <label class="s-lbl">${escape(w.field)}<input class="s-fld" value="${escape(w.value)}" readonly tabindex="-1"></label>
      <div class="s-row"><button type="button" class="s-btn" tabindex="-1">${escape(w.primary)}</button><button type="button" class="s-btn s-quiet" tabindex="-1">${escape(w.quiet)}</button><a class="s-lnk" href="#top" tabindex="-1">${escape(w.link)}</a></div>
    </div>
    <div class="s-states"><span class="s-st s-ok">${escape(w.ok)}</span><span class="s-st s-wait">${escape(w.wait)}</span><span class="s-st s-danger">${escape(w.danger)}</span></div>
    <div class="s-cats">${cats}</div>
    <p class="s-fig">${escape(w.figures)}</p>
    <ul class="s-sw">${swatches}</ul>
  </div>
</div>`;
}

// The specimen's own CSS: only contract tokens, as a tool's would be.
export const specimenCss = `
.spec{background:var(--bg);color:var(--ink);font:var(--text-m)/var(--leading) var(--font-body);border-radius:14px;overflow:hidden;border:1px solid color-mix(in oklab,var(--line) 70%,transparent);min-width:0}
.spec *{box-sizing:border-box}
.s-bar{display:flex;align-items:center;gap:var(--space-2);padding:var(--space-3) var(--space-4);background:var(--inverse);color:var(--inverse-ink)}
.s-mark{width:22px;height:22px;border-radius:var(--radius-s);background:var(--accent);box-shadow:inset 0 0 0 var(--border-width) var(--accent-line)}
.s-app{font-family:var(--font-display);font-weight:var(--display-weight);letter-spacing:var(--display-tracking)}
.s-who{margin-left:auto;display:flex;align-items:center;gap:var(--space-2);color:var(--inverse-ink-2);font-size:var(--text-s)}
.s-avatar{width:26px;height:26px;border-radius:var(--radius-pill);display:grid;place-items:center;background:var(--inverse-line);color:var(--inverse-ink);font-size:10px;font-weight:var(--weight-strong)}
.s-body{padding:var(--space-5) var(--space-4) var(--space-4);display:grid;gap:var(--space-4)}
.s-h{margin:0;font:var(--display-weight) var(--text-xl)/1.15 var(--font-display);letter-spacing:var(--display-tracking)}
.s-lead{margin:0;color:var(--ink-2);font-family:var(--font-read)}
.s-mk{background:var(--highlight);color:var(--ink);padding:0 .3em;border-radius:var(--radius-s)}
.s-card{background:var(--surface);border:var(--border-width) solid var(--line);border-radius:var(--radius-l);padding:var(--space-4);box-shadow:var(--shadow-1);display:grid;gap:var(--space-3)}
.s-lbl{display:grid;gap:var(--space-1);font-size:var(--text-s);color:var(--ink-2)}
.s-fld{font:inherit;font-size:var(--text-m);color:var(--ink);background:var(--surface);border:var(--border-width) solid var(--line-strong);border-radius:var(--radius-m);min-height:var(--control-h);padding:0 var(--space-3);width:100%}
.s-row{display:flex;flex-wrap:wrap;align-items:center;gap:var(--space-2)}
.s-btn{font:inherit;font-weight:var(--weight-strong);min-height:var(--control-h);padding:0 var(--space-4);border-radius:var(--radius-m);border:var(--border-width) solid var(--accent-line);background:var(--accent);color:var(--accent-ink);box-shadow:var(--shadow-1);cursor:default}
.s-quiet{background:transparent;color:var(--ink);border-color:var(--line-strong);box-shadow:none}
.s-lnk{color:var(--accent-text);font-weight:var(--weight-strong);text-underline-offset:3px;margin-left:var(--space-2)}
.s-lnk:focus-visible,.s-btn:focus-visible{outline:3px solid var(--focus);outline-offset:2px}
.s-states{display:flex;flex-wrap:wrap;gap:var(--space-2)}
.s-st{display:inline-flex;align-items:center;gap:.45em;padding:.2em .7em;border-radius:var(--radius-chip);font-size:var(--text-s);font-weight:var(--weight-strong)}
.s-st::before{content:"";width:.62em;height:.62em;flex:none}
.s-ok{background:var(--ok-soft);color:var(--ok-ink)}.s-ok::before{background:var(--ok)}
.s-wait{background:var(--wait-soft);color:var(--wait-ink)}.s-wait::before{border:2px solid var(--wait)}
.s-danger{background:var(--danger-soft);color:var(--danger-ink)}.s-danger::before{background:var(--danger);transform:rotate(45deg) scale(.85)}
.s-cats{display:flex;flex-wrap:wrap;gap:6px}
.cat{display:inline-flex;align-items:center;gap:.4em;padding:.15em .6em;border-radius:var(--radius-s);font-size:var(--text-xs);font-weight:var(--weight-strong)}
.cat i{width:.55em;height:.55em;border-radius:var(--radius-pill)}
.s-fig{margin:0;font-family:var(--font-mono);font-size:var(--text-s);color:var(--ink-2);font-variant-numeric:tabular-nums}
.s-sw{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
.s-sw li{display:grid;grid-template-columns:22px 1fr;column-gap:6px;align-items:center;font-size:11px;line-height:1.25;min-width:0}
.s-sw span{grid-row:span 2;width:22px;height:22px;border-radius:6px;box-shadow:inset 0 0 0 1px color-mix(in oklab,var(--ink) 18%,transparent)}
.s-sw b{font-weight:600;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.s-sw code{color:var(--ink-2);font-size:10px}
@media (max-width:520px){.s-sw{grid-template-columns:repeat(2,minmax(0,1fr))}}
`;
