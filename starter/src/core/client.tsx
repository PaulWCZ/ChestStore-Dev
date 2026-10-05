import { Toasts, useToast, type ShowToast } from "@argentic/chest-ui/components";
import type { ToastWords } from "@argentic/chest-ui/components/logic";
import { createElement, useEffect, type ComponentType } from "react";
import type { hydrateRoot, Root } from "react-dom/client";
import type { actions } from "../actions.ts";
import type { Action, InputOf, Outcome } from "./tool.ts";

// The browser's side of the starter, for islands: call() an action,
// refresh() the page in place, toast() a message. Nothing here runs on
// import: src/core/entry.tsx starts it.

// ---- Islands: hydrated on load, kept (state, focus) across refreshes.
let registry: Record<string, ComponentType<object>> = {};
let hydrate: typeof hydrateRoot;
const roots = new Map<Element, Root>();
const propsOf = (el: Element): object => JSON.parse(el.getAttribute("data-props") ?? "{}") as object;

// react-dom/client comes from entry.tsx: the server never loads it.
export function start(islands: Record<string, ComponentType<never>>, hydrateRoot: typeof hydrate): void {
  registry = islands as typeof registry;
  hydrate = hydrateRoot;
  for (const el of document.querySelectorAll("[data-island]")) mount(el);
}
function mount(el: Element): void {
  const component = registry[el.getAttribute("data-island") ?? ""];
  if (component && !roots.has(el)) roots.set(el, hydrate(el, createElement(component, propsOf(el))));
}
const islandsIn = (node: Node): Element[] => (node instanceof Element ? [...(node.matches("[data-island]") ? [node] : []), ...node.querySelectorAll("[data-island]")] : []);

// ---- refresh(): the page read again from the server, its HTML put in
// place node by node. What did not change stays as it is: focus, scroll,
// what is typed, an open <details> or <dialog>, and each island's state
// (it receives its new props). Items of a list that changes keep their
// place by their id (or data-key) attribute.
let latest = 0;
export async function refresh(): Promise<void> {
  const ticket = ++latest;
  const response = await fetch(location.href, { headers: { accept: "text/html" } });
  const html = response.headers.get("content-type")?.startsWith("text/html") ? await response.text() : null;
  if (ticket !== latest) return; // a newer refresh is on its way
  if (html === null) return location.reload();
  const next = new DOMParser().parseFromString(html, "text/html");
  if (response.redirected) history.replaceState(null, "", response.url);
  document.title = next.title;
  const focused = document.activeElement;
  attributes(document.body, next.body);
  children(document.body, next.body);
  // The focused element went with what changed: the page's main region.
  if (focused && focused !== document.body && !focused.isConnected) document.getElementById("main")?.focus({ preventScroll: true });
}

const keyOf = (node: Node) => (node instanceof Element ? node.getAttribute("data-key") ?? (node.id || null) : null);
const same = (a: Node, b: Node) => a.nodeType === b.nodeType && a.nodeName === b.nodeName && keyOf(a) === keyOf(b) && (!(a instanceof Element) || a.getAttribute("data-island") === (b as Element).getAttribute("data-island"));

function attributes(from: Element, to: Element): void {
  const kept = from.localName === "details" || from.localName === "dialog" ? ["open"] : [];
  for (const { name } of [...from.attributes]) if (!to.hasAttribute(name) && !kept.includes(name)) from.removeAttribute(name);
  for (const { name, value } of [...to.attributes]) if (from.getAttribute(name) !== value) from.setAttribute(name, value);
}

function children(parent: Element, next: Element): void {
  let current = parent.firstChild;
  for (const incoming of [...next.childNodes]) {
    let match = current && same(current, incoming) ? current : null;
    if (!match && keyOf(incoming) !== null) {
      for (let later = current?.nextSibling ?? null; later && !match; later = later.nextSibling) if (same(later, incoming)) match = later;
      if (match) parent.insertBefore(match, current);
    }
    if (match) {
      update(match, incoming);
      current = match.nextSibling;
    } else {
      const node = document.importNode(incoming, true);
      parent.insertBefore(node, current);
      islandsIn(node).forEach(mount);
    }
  }
  while (current) {
    const gone = current;
    current = current.nextSibling;
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

// ---- call(): run an action of src/actions.ts from an island, typed by its
// definition. On success the page refreshes (unless refresh: false); a
// refusal is shown as a toast in the reader's words (unless quiet: true)
// and returned, so the island may say more.
type Actions = typeof actions;
type In<A> = A extends Action<infer F, unknown> ? InputOf<F> : never;
type Out<A> = A extends Action<never, infer R> ? R : never;

export async function call<N extends keyof Actions>(name: N, input: In<Actions[N]>, options: { refresh?: boolean; quiet?: boolean } = {}): Promise<Outcome<Out<Actions[N]>>> {
  const members = location.pathname.split("/")[1]?.toLowerCase() === "chest";
  return send(`${members ? "/chest" : ""}/actions/${String(name)}`, { "content-type": "application/json" }, JSON.stringify(input), options);
}

// What call() and the forms of src/core/entry.tsx share: the request, its
// outcome, the refresh or the redirect, the toast.
export async function send<T>(url: string, headers: Record<string, string>, body: BodyInit, options: { refresh?: boolean; quiet?: boolean } = {}): Promise<Outcome<T>> {
  let outcome: Outcome<T> & { redirect?: string };
  try {
    const response = await fetch(url, { method: "POST", headers: { ...headers, "x-tool-action": "1" }, body });
    outcome = await response.json() as typeof outcome;
  } catch {
    outcome = { ok: false, error: "unavailable", message: offline };
  }
  if (outcome.redirect) location.assign(outcome.redirect);
  else if (outcome.ok && options.refresh !== false) await refresh();
  if (!outcome.ok && !options.quiet) toast({ text: outcome.message, tone: "error" });
  return outcome;
}

// ---- toast(): the kit's toasts (Undo, errors) from anywhere in the
// browser. <ToastHost> is an island of every layout (src/layout.tsx).
let show: ShowToast | null = null;
let offline = "";
const waiting: Parameters<ShowToast>[0][] = [];
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
export function ToastHost({ labels, unavailable }: { labels: ToastWords; unavailable: string }) {
  offline = unavailable;
  return <Toasts labels={labels}><Bridge /></Toasts>;
}
