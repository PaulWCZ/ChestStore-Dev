import type { ComponentType } from "react";
import { flushSync } from "react-dom";
import { createRoot, hydrateRoot } from "react-dom/client";
import { busyText, intercepts, navigate, refresh, send, startIslands, toast } from "./runtime.tsx";

// The browser's start, called once by the tool's src/entry.tsx:
//   start(islands)
// The islands come to life, and every <form method="post"> to an action
// is sent in place — no page load, the page refreshed, then the form
// emptied; a refusal about a field said next to it (showFieldError), any
// other as a toast. Without JavaScript the same form posts
// and the server redirects back.
const actionPath = /\/actions\/[A-Za-z0-9_]+$/u; // /chest/actions/x, /actions/x, /p/abc/actions/x

// lazy (optional): the tool's islands loaded on demand, by name —
//   import lazy from "virtual:chest-islands";
//   start({ ToastHost }, lazy);
// — each page downloads only the code of the islands it shows.
// It resolves once the page's islands are alive (<html data-ready>); the
// entry awaits it (await start(…)): the page's load event then waits too.
export async function start(islands: Record<string, ComponentType<never>>, lazy: Record<string, () => Promise<unknown>> = {}): Promise<void> {
  const ready = startIslands(islands, { hydrateRoot, createRoot, flushSync }, lazy);
  // Links between pages of the same part: in place (runtime.tsx, intercepts).
  document.addEventListener("click", event => {
    const link = intercepts(event);
    if (!link) return;
    event.preventDefault();
    void navigate(link.href);
  });
  document.addEventListener("submit", event => {
    const form = event.target;
    if (event.defaultPrevented || !(form instanceof HTMLFormElement)) return;
    const submitter = event.submitter instanceof HTMLButtonElement || event.submitter instanceof HTMLInputElement ? event.submitter : null;
    const url = submitter?.hasAttribute("formaction") ? submitter.formAction : form.action;
    const method = (submitter?.getAttribute("formmethod") ?? form.getAttribute("method") ?? "get").toLowerCase();
    if (method !== "post" || !actionPath.test(new URL(url).pathname)) return;
    event.preventDefault();
    if (form.getAttribute("aria-busy") === "true") return toast({ id: "busy", text: busyText() });
    form.setAttribute("aria-busy", "true");
    const body = new FormData(form, event.submitter);
    clearFieldErrors(form);
    void send(url, {}, body, { refresh: false, quiet: true, ...(form.hasAttribute("data-parallel") ? { parallel: true } : {}) }).then(async outcome => {
      if (!outcome.ok) {
        // A refusal about one field: said under it, the field focused; any
        // other, a toast.
        if (!(outcome.field && showFieldError(form, outcome.field, outcome.message))) toast({ text: outcome.message, tone: "error" });
        return;
      }
      if (outcome.redirect) return;
      await refresh();
      form.reset();
    }).finally(() => form.removeAttribute("aria-busy"));
  });
  await ready;
}

// A refusal about one field, said as a form sent without JavaScript says
// it: the field aria-invalid and described by the sentence, which sits
// next to it — in the page's own place for that field's error when it has
// one (an element of the form with the id "<field's id>-error", as the
// kit's fields and a page's no-JS answer render it: filled and shown), else
// in a .ck-error after the field — and the focus there. What was typed
// stays. The mark goes at the field's next input, or at the next send.
function showFieldError(form: HTMLFormElement, name: string, message: string): boolean {
  const named = form.elements.namedItem(name);
  const field = named instanceof RadioNodeList ? (named[0] as HTMLElement | undefined) : (named as HTMLElement | null);
  if (!field || !(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement) || field.type === "hidden") return false;
  const own = field.id ? form.querySelector<HTMLElement>(`[id="${CSS.escape(field.id)}-error"]`) : null;
  let said: HTMLElement;
  if (own) {
    said = own;
    said.setAttribute("data-field-error", "kept");
    said.hidden = false;
  } else {
    said = document.createElement("p");
    said.id = `${field.id || `${name}-${Math.random().toString(36).slice(2, 6)}`}-error`;
    said.className = "ck-error";
    said.setAttribute("data-field-error", "added");
    field.insertAdjacentElement("afterend", said);
  }
  said.setAttribute("role", "alert");
  said.textContent = message;
  field.setAttribute("aria-invalid", "true");
  const described = (field.getAttribute("aria-describedby") ?? "").split(" ").filter(Boolean);
  if (!described.includes(said.id)) field.setAttribute("aria-describedby", [...described, said.id].join(" "));
  field.focus();
  // Cleared as soon as the person changes what they typed (each field of
  // a radio group or a list of boxes shares the name).
  const clear = (event: Event) => {
    const target = event.target;
    if (!(target instanceof Element) || target.getAttribute("name") !== name) return;
    form.removeEventListener("input", clear);
    form.removeEventListener("change", clear);
    clearFieldError(form, said);
  };
  form.addEventListener("input", clear);
  form.addEventListener("change", clear);
  return true;
}
function clearFieldError(form: HTMLFormElement, said: Element): void {
  const how = said.getAttribute("data-field-error");
  if (how === null) return;
  for (const field of form.querySelectorAll<HTMLElement>(`[aria-describedby~="${CSS.escape(said.id)}"]`)) {
    field.removeAttribute("aria-invalid");
    const rest = (field.getAttribute("aria-describedby") ?? "").split(" ").filter(x => x && x !== said.id).join(" ");
    if (rest) field.setAttribute("aria-describedby", rest);
    else field.removeAttribute("aria-describedby");
  }
  said.removeAttribute("data-field-error");
  if (how === "added") said.remove();
  else {
    // The page's own place: emptied and hidden, there for the next time.
    said.textContent = "";
    (said as HTMLElement).hidden = true;
  }
}
function clearFieldErrors(form: HTMLFormElement): void {
  for (const said of form.querySelectorAll("[data-field-error]")) clearFieldError(form, said);
}
