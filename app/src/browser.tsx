import type { ComponentType } from "react";
import { flushSync } from "react-dom";
import { createRoot, hydrateRoot } from "react-dom/client";
import { busyText, refresh, send, startIslands, toast } from "./runtime.tsx";

// The browser's start, called once by the tool's src/entry.tsx:
//   start(islands)
// The islands come to life, and every <form method="post"> to an action
// is sent in place — no page load, the page refreshed, then the form
// emptied; a refusal as a toast. Without JavaScript the same form posts
// and the server redirects back.
const actionPath = /\/actions\/[A-Za-z0-9_]+$/u; // /chest/actions/x, /actions/x, /p/abc/actions/x

export function start(islands: Record<string, ComponentType<never>>): void {
  startIslands(islands, { hydrateRoot, createRoot, flushSync });
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
    void send(url, {}, body, { refresh: false }).then(async outcome => {
      if (!outcome.ok || outcome.redirect) return;
      await refresh();
      form.reset();
    }).finally(() => form.removeAttribute("aria-busy"));
  });
}
