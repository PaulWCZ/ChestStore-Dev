import "@argentic/chest-ui/components.css";
import "../styles.css";
import { hydrateRoot } from "react-dom/client";
import { islands } from "../islands/index.ts";
import { refresh, send, start } from "./client.tsx";

// The browser's script (built to /assets/client.js): the islands come to
// life, and every <form method="post"> to an action is sent in place —
// without a page load, the page refreshed after it, the form emptied, a
// refusal shown as a toast. Without JavaScript the same form posts and
// the server redirects back.
start(islands, hydrateRoot);

const actionPath = /^\/(chest\/)?actions\/[A-Za-z0-9_]+$/u;
document.addEventListener("submit", event => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement) || form.method !== "post" || !actionPath.test(new URL(form.action).pathname)) return;
  event.preventDefault();
  if (form.getAttribute("aria-busy") === "true") return;
  form.setAttribute("aria-busy", "true");
  const body = new FormData(form, event.submitter);
  void send(form.action, {}, body, { refresh: false }).then(async outcome => {
    if (!outcome.ok || "redirect" in outcome) return;
    form.reset();
    await refresh();
  }).finally(() => form.removeAttribute("aria-busy"));
});
