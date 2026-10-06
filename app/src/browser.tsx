import type { ComponentType } from "react";
import { flushSync } from "react-dom";
import { createRoot, hydrateRoot } from "react-dom/client";
import { busyText, intercepts, navigate, refresh, send, startIslands, toast } from "./runtime.tsx";

// The browser's start, called once by the tool's src/entry.tsx:
//   start(islands)
// The islands come to life, and every <form method="post"> to an action
// is sent in place — no page load, the page refreshed, then the form
// emptied; a refusal as a toast. Without JavaScript the same form posts
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

// A refusal under its field: aria-invalid, the sentence in a .ck-error
// the field describes itself by, the focus there. Gone at the next send.
function showFieldError(form: HTMLFormElement, name: string, message: string): boolean {
  const named = form.elements.namedItem(name);
  const field = named instanceof RadioNodeList ? (named[0] as HTMLElement | undefined) : (named as HTMLElement | null);
  if (!field || !(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement) || field.type === "hidden") return false;
  const id = `${field.id || `${name}-${Math.random().toString(36).slice(2, 6)}`}-error`;
  const said = document.createElement("p");
  said.id = id;
  said.className = "ck-error";
  said.setAttribute("data-field-error", "");
  said.setAttribute("role", "alert");
  said.textContent = message;
  field.insertAdjacentElement("afterend", said);
  field.setAttribute("aria-invalid", "true");
  field.setAttribute("aria-describedby", [field.getAttribute("aria-describedby"), id].filter(Boolean).join(" "));
  field.focus();
  return true;
}
function clearFieldErrors(form: HTMLFormElement): void {
  for (const said of form.querySelectorAll("[data-field-error]")) {
    const field = form.querySelector<HTMLElement>(`[aria-describedby~="${said.id}"]`);
    if (field) {
      field.removeAttribute("aria-invalid");
      const rest = (field.getAttribute("aria-describedby") ?? "").split(" ").filter(x => x && x !== said.id).join(" ");
      if (rest) field.setAttribute("aria-describedby", rest);
      else field.removeAttribute("aria-describedby");
    }
    said.remove();
  }
}