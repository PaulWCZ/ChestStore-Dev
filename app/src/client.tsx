import { Toasts, useToast, type ShowToast } from "@argentic/chest-ui/components";
import type { ToastWords } from "@argentic/chest-ui/components/logic";
import { createElement, useEffect, type ComponentType } from "react";
import type { hydrateRoot, Root } from "react-dom/client";
import type { RegisteredActions } from "./register.ts";
export { fill, plural, type Plural } from "./i18n.ts";
import type { Action, Outcome, SentOf } from "./tool.ts";

// The browser's side, for islands: call() an action, refresh() the page in
// place, navigate() to another page in place, toast() a message. Nothing
// here runs on import (and nothing loads react-dom/client): the tool's
// src/entry.tsx starts it with start() from "@argentic/chest-app/browser".

// ---- Islands: hydrated on load, kept (state, focus) across refreshes.
let registry: Record<string, ComponentType<object>> = {};
let hydrate: typeof hydrateRoot;
const roots = new Map<Element, Root>();
const propsOf = (el: Element): object => JSON.parse(el.getAttribute("data-props") ?? "{}") as object;
// What the server put directly in <body>: a refresh changes only that;
// what a script added there (a portal, a live region) stays.
const served = new WeakSet<Node>();

export function startIslands(islands: Record<string, ComponentType<never>>, hydrateRoot: typeof hydrate): void {
  registry = islands as typeof registry;
  hydrate = hydrateRoot;
  for (const node of document.body.childNodes) served.add(node);
  for (const el of document.querySelectorAll("[data-island]")) mount(el);
  // Back and Forward between addresses navigate() made: the page follows.
  addEventListener("popstate", () => void refresh());
}
// Each island is a root of its own, with the id prefix the server used.
function mount(el: Element): void {
  const component = registry[el.getAttribute("data-island") ?? ""];
  if (component && !roots.has(el)) roots.set(el, hydrate(el, createElement(component, propsOf(el)), { identifierPrefix: el.getAttribute("data-prefix") ?? "" }));
}
const islandsIn = (node: Node): Element[] => (node instanceof Element ? [...(node.matches("[data-island]") ? [node] : []), ...node.querySelectorAll("[data-island]")] : []);

// ---- refresh(): the page read again from the server, its HTML put in
// place node by node. What did not change stays as it is: focus, scroll,
// what is typed, an open <details> or <dialog>, each island's state (it
// receives its new props). Items of a list keep their place by their id
// (or data-key). Never throws: true when the page was put in place.
// 401/403 (signed out, access removed): the page is loaded again, as the
// Chest shows it. Another error: a toast, the page kept as it is.
let latest = 0;
let sending = 0;
export function refresh(): Promise<boolean> {
  return load(location.href, false);
}

async function load(href: string, push: false | "push" | "replace"): Promise<boolean> {
  const ticket = ++latest;
  // A page read while an action is on its way may predate it: not shown
  // (the action's own refresh follows).
  const settled = sending === 0;
  let response: Response;
  let html: string | null = null;
  try {
    response = await fetch(href, { headers: { accept: "text/html" } });
    if (response.headers.get("content-type")?.startsWith("text/html")) html = await response.text();
  } catch {
    if (ticket === latest) toast({ id: "refresh", text: words.unavailable, tone: "error" });
    return false;
  }
  if (ticket !== latest || !settled || sending > 0) return false;
  if (response.status === 401 || response.status === 403 || html === null) {
    if (push) location.assign(href);
    else location.reload();
    return false;
  }
  if (!response.ok && !push) {
    toast({ id: "refresh", text: words.unavailable, tone: "error" });
    return false;
  }
  const next = new DOMParser().parseFromString(html, "text/html");
  if (push === "push") history.pushState(null, "", response.url);
  else if (push === "replace" || response.redirected) history.replaceState(null, "", response.url);
  document.title = next.title;
  const focused = document.activeElement;
  attributes(document.body, next.body);
  children(document.body, next.body);
  // The focused element went with what changed: the page's main region.
  if (focused && focused !== document.body && !focused.isConnected) document.getElementById("main")?.focus({ preventScroll: true });
  return true;
}

// ---- navigate(): another page of the same part without loading it again:
// its HTML put in place as refresh() does, the address in the history,
// the top of the page in view, the layout's islands (a toast and its
// Undo) kept. Another part or another site: a plain page load.
export async function navigate(to: string, { replace = false, top = true }: { replace?: boolean; top?: boolean } = {}): Promise<void> {
  const target = new URL(to, location.href);
  const members = (path: string) => path.split("/")[1]?.toLowerCase() === "chest";
  if (target.origin !== location.origin || members(target.pathname) !== members(location.pathname)) return location.assign(target.href);
  if (!(await load(target.href, replace ? "replace" : "push"))) return;
  if (top) scrollTo(0, 0);
  document.getElementById("main")?.focus({ preventScroll: true });
}

// A link's onClick that navigates in place (a click with a modifier or the
// middle button opens it as the browser does). The kit's `link` takes it.
export function onLinkClick(event: { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; defaultPrevented: boolean; preventDefault(): void; currentTarget: { getAttribute(name: string): string | null } }, options: { replace?: boolean; top?: boolean } = {}): void {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const href = event.currentTarget.getAttribute("href");
  if (!href) return;
  event.preventDefault();
  void navigate(href, options);
}

const keyOf = (node: Node) => (node instanceof Element ? node.getAttribute("data-key") ?? (node.id || null) : null);
const same = (a: Node, b: Node) => a.nodeType === b.nodeType && a.nodeName === b.nodeName && keyOf(a) === keyOf(b) && (!(a instanceof Element) || a.getAttribute("data-island") === (b as Element).getAttribute("data-island"));

function attributes(from: Element, to: Element): void {
  const kept = from.localName === "details" || from.localName === "dialog" ? ["open"] : [];
  for (const { name } of [...from.attributes]) if (!to.hasAttribute(name) && !kept.includes(name)) from.removeAttribute(name);
  for (const { name, value } of [...to.attributes]) if (from.getAttribute(name) !== value) from.setAttribute(name, value);
}

function children(parent: Element, next: Element): void {
  const foreign = (node: ChildNode | null) => parent === document.body && node !== null && !served.has(node);
  const skip = (node: ChildNode | null) => { while (foreign(node)) node = node!.nextSibling; return node; };
  let current = skip(parent.firstChild);
  for (const incoming of [...next.childNodes]) {
    let match = current && same(current, incoming) ? current : null;
    if (!match && keyOf(incoming) !== null) {
      for (let later = current?.nextSibling ?? null; later && !match; later = later.nextSibling) if (!foreign(later) && same(later, incoming)) match = later;
      if (match) parent.insertBefore(match, current);
    }
    if (match) {
      update(match, incoming);
      current = skip(match.nextSibling);
    } else {
      const node = document.importNode(incoming, true);
      parent.insertBefore(node, current);
      if (parent === document.body) served.add(node);
      islandsIn(node).forEach(mount);
    }
  }
  while (current) {
    const gone = current;
    current = skip(current.nextSibling);
    for (const el of islandsIn(gone)) { roots.get(el)?.unmount(); roots.delete(el); }
    gone.remove();
  }
}

function update(node: ChildNode, incoming: ChildNode): void {
  if (!(node instanceof Element)) {
    if (node.nodeValue !== incoming.nodeValue) node.nodeValue = incoming.nodeValue;
    return;
  }
  const before = node.getAttribute("data-props");
  attributes(node, incoming as Element);
  const root = roots.get(node);
  if (root) {
    // An island: React owns its inside; it gets its new props.
    if (node.getAttribute("data-props") !== before) root.render(createElement(registry[node.getAttribute("data-island")!]!, propsOf(node)));
    return;
  }
  children(node, incoming as Element);
}

// ---- call(): run an action of the tool's src/actions.ts from an island,
// typed by its fields. On success the page refreshes (unless refresh:
// false) or follows the action's redirect(); a refusal is a toast in the
// reader's words (unless quiet: true) and is returned. at: a path of the
// tool where the server answers the public actions too (publicActionsAt).
type In<A> = A extends Action<infer F, unknown> ? SentOf<F> : never;
type Out<A> = A extends { run(...args: never[]): Promise<infer R> } ? R : never;
type Name = Extract<keyof RegisteredActions, string>;

export function call<N extends Name>(name: N, input: In<RegisteredActions[N]>, options: { refresh?: boolean; quiet?: boolean; at?: string } = {}): Promise<Outcome<Out<RegisteredActions[N]>>> {
  const members = location.pathname.split("/")[1]?.toLowerCase() === "chest";
  const base = options.at !== undefined ? options.at.replace(/\/$/u, "") : members ? "/chest" : "";
  return send(`${base}/actions/${name}`, { "content-type": "application/json" }, JSON.stringify(input), options);
}

// What call() and the enhanced forms share: the request, its outcome, the
// redirect or the refresh, the toast. Never throws.
export async function send<T>(url: string, headers: Record<string, string>, body: BodyInit, options: { refresh?: boolean; quiet?: boolean } = {}): Promise<Outcome<T> & { redirect?: string }> {
  let outcome: Outcome<T> & { redirect?: string };
  sending++;
  try {
    const response = await fetch(url, { method: "POST", headers: { ...headers, "x-tool-action": "1" }, body });
    if (response.headers.get("content-type")?.startsWith("application/json")) outcome = await response.json() as typeof outcome;
    else if (response.status === 401) {
      location.reload(); // signed out: the Chest signs in again
      outcome = { ok: false, error: "unavailable", message: words.unavailable } as typeof outcome;
    } else outcome = { ok: false, error: "unavailable", message: words.unavailable } as typeof outcome;
  } catch {
    outcome = { ok: false, error: "unavailable", message: words.unavailable } as typeof outcome;
  } finally {
    sending--;
  }
  if (outcome.ok && outcome.redirect) await navigate(outcome.redirect);
  else if (outcome.ok && options.refresh !== false) await refresh();
  if (!outcome.ok && !options.quiet) toast({ text: outcome.message, tone: "error" });
  return outcome;
}

// ---- toast(): the kit's toasts (Undo, errors) from anywhere in the
// browser. <ToastHost> is an island of every layout.
let show: ShowToast | null = null;
const waiting: Parameters<ShowToast>[0][] = [];
let words = { unavailable: "The Chest did not answer. Try again in a moment.", busy: "Still sending…" };
export const busyText = () => words.busy;
export function toast(input: Parameters<ShowToast>[0]): void {
  if (show) show(input);
  else waiting.push(input);
}
function Bridge() {
  const t = useToast();
  useEffect(() => {
    show = t;
    waiting.splice(0).forEach(t);
  }, [t]);
  return null;
}
// labels: t.kit.toast; words: { unavailable: t.errors.unavailable, busy: t.pages.busy }.
export function ToastHost({ labels, words: said }: { labels: ToastWords; words: { unavailable: string; busy: string } }) {
  words = said;
  return <Toasts labels={labels}><Bridge /></Toasts>;
}
