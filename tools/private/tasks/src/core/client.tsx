import { Toasts, useToast, type ShowToast } from "@argentic/chest-ui/components";
import type { ToastWords } from "@argentic/chest-ui/components/logic";
import { createElement, useEffect, type ComponentType } from "react";
import type { flushSync } from "react-dom";
import type { createRoot, hydrateRoot, Root } from "react-dom/client";
import type { actions } from "../actions.ts";
import type { Action, Outcome, SentOf } from "./tool.ts";

// The browser's side of the starter, for islands: call() an action,
// refresh() the page in place, toast() a message. Nothing here runs on
// import: src/core/entry.tsx starts it.

// ---- Islands: hydrated on load, kept (state, focus) across refreshes.
let registry: Record<string, ComponentType<object>> = {};
let dom: { hydrateRoot: typeof hydrateRoot; createRoot: typeof createRoot; flushSync: typeof flushSync };
const roots = new Map<Element, Root>();
const propsOf = (el: Element): object => JSON.parse(el.getAttribute("data-props") ?? "{}") as object;
// What the server put directly in <body>: a refresh changes only that. What
// a script added there (a library's live region, a portal) stays.
const served = new WeakSet<Node>();

// react-dom/client comes from entry.tsx: the server never loads it.
export function start(islands: Record<string, ComponentType<never>>, reactDom: typeof dom): void {
  registry = islands as typeof registry;
  dom = reactDom;
  for (const node of document.body.childNodes) served.add(node);
  for (const el of document.querySelectorAll("[data-island]")) mount(el);
  // Back and forward between addresses navigate() made: the page follows.
  addEventListener("popstate", () => void refresh());
}
// Each island is a root of its own, with the prefix of its ids the server
// used (src/core/island.tsx). On load, the server's HTML is hydrated. An
// island a refresh brings (a card's panel opened) is rendered at once,
// effects included, before the browser shows it: a key pressed the moment
// it appears (Escape) finds its listeners there.
function mount(el: Element, now = false): void {
  const component = registry[el.getAttribute("data-island") ?? ""];
  if (!component || roots.has(el)) return;
  const options = { identifierPrefix: el.getAttribute("data-prefix") ?? "" };
  const element = createElement(component, propsOf(el));
  if (!now) return void roots.set(el, dom.hydrateRoot(el, element, options));
  const root = dom.createRoot(el, options);
  roots.set(el, root);
  dom.flushSync(() => root.render(element));
}
const islandsIn = (node: Node): Element[] => (node instanceof Element ? [...(node.matches("[data-island]") ? [node] : []), ...node.querySelectorAll("[data-island]")] : []);

// ---- refresh(): the page read again from the server, its HTML put in
// place node by node. What did not change stays as it is: focus, scroll,
// what is typed, an open <details> or <dialog>, and each island's state
// (it receives its new props). Items of a list that changes keep their
// place by their id (or data-key) attribute.
let latest = 0;
// Actions sent and not answered yet: a page read meanwhile may predate
// them (a timer's refresh), so it is not shown — the action's own refresh
// follows.
let sending = 0;
export function refresh(): Promise<void> {
  return render(location.href);
}

// Reads a page of this tool and puts it in place. arrive() runs just
// before, once the page is there (navigate(): the address changes then, as
// a link's would — not while the page is still on its way).
let moves = 0;
async function render(href: string, arrive?: () => void): Promise<void> {
  // A newer read of the page wins over an older one; a navigation is never
  // undone by a refresh that was on its way (it read the address before).
  const ticket = ++latest;
  const move = arrive ? ++moves : moves;
  const settled = sending === 0;
  let response: Response;
  try {
    response = await fetch(href, { headers: { accept: "text/html" } });
  } catch {
    if (arrive) location.assign(href);
    return; // offline for a moment: the next refresh will do
  }
  const html = response.headers.get("content-type")?.startsWith("text/html") ? await response.text() : null;
  if (move !== moves) return; // the page went elsewhere meanwhile
  if (!arrive && ticket !== latest) return; // a newer read is on its way
  if (!arrive && (!settled || sending > 0)) return;
  // An error page (gone, not allowed, failed) or not a page: the browser
  // shows it whole rather than merging it into this one.
  if (html === null || !response.ok) return arrive ? location.assign(href) : location.reload();
  const next = new DOMParser().parseFromString(html, "text/html");
  arrive?.();
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
  // In <body>, what a script added is passed over and kept.
  const foreign = (node: ChildNode | null) => parent === document.body && node !== null && !served.has(node);
  const skip = (node: ChildNode | null) => { while (foreign(node)) node = node!.nextSibling; return node; };
  let current = skip(parent.firstChild);
  for (const incoming of [...next.childNodes]) {
    let match = current && same(current, incoming) ? current : null;
    if (!match && keyOf(incoming) !== null) {
      for (let later = current?.nextSibling ?? null; later && !match; later = later.nextSibling) if (same(later, incoming)) match = later;
      if (match) parent.insertBefore(match, current);
    }
    if (match) {
      update(match, incoming);
      current = skip(match.nextSibling);
    } else {
      const node = document.importNode(incoming, true);
      parent.insertBefore(node, current);
      if (parent === document.body) served.add(node);
      for (const el of islandsIn(node)) mount(el, true);
    }
  }
  while (current) {
    const gone = current;
    current = skip(current.nextSibling);
    for (const el of islandsIn(gone)) { roots.get(el)?.unmount(); roots.delete(el); }
    gone.remove();
  }
}

// ---- navigate(): another address of the same page (a card opened, a
// filter, a view, a month) without loading the page: the address changes,
// the page is read again and changed in place — the islands keep their
// state (a board's scroll, an open menu). replace: no new history entry
// (a filter); top: back to the top of the page (another view).
export async function navigate(to: string, options: { replace?: boolean; top?: boolean } = {}): Promise<void> {
  const url = new URL(to, location.href);
  if (url.origin !== location.origin) return location.assign(url);
  await render(url.href, () => {
    if (options.replace) history.replaceState(null, "", url);
    else history.pushState(null, "", url);
  });
  if (options.top) scrollTo({ top: 0 });
}

// A link that navigates in place (a plain click; a click with a modifier,
// or the middle button, opens it as the browser does). The kit's
// components take it as their `link`.
export function onLinkClick(event: { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; defaultPrevented: boolean; preventDefault(): void; currentTarget: { getAttribute(name: string): string | null } }, options: { replace?: boolean; top?: boolean } = {}): void {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const href = event.currentTarget.getAttribute("href");
  if (!href) return;
  event.preventDefault();
  void navigate(href, options);
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
type In<A> = A extends Action<infer F, unknown> ? SentOf<F> : never;
type Out<A> = A extends { run(...args: never[]): Promise<infer R> } ? R : never;

export async function call<N extends keyof Actions>(name: N, input: In<Actions[N]>, options: { refresh?: boolean; quiet?: boolean } = {}): Promise<Outcome<Out<Actions[N]>>> {
  const members = location.pathname.split("/")[1]?.toLowerCase() === "chest";
  return send(`${members ? "/chest" : ""}/actions/${String(name)}`, { "content-type": "application/json" }, JSON.stringify(input), options);
}

// What call() and the forms of src/core/entry.tsx share: the request, its
// outcome, the refresh or the redirect, the toast.
export async function send<T>(url: string, headers: Record<string, string>, body: BodyInit, options: { refresh?: boolean; quiet?: boolean } = {}): Promise<Outcome<T>> {
  let outcome: Outcome<T> & { redirect?: string };
  sending++;
  try {
    const response = await fetch(url, { method: "POST", headers: { ...headers, "x-tool-action": "1" }, body });
    outcome = await response.json() as typeof outcome;
  } catch {
    outcome = { ok: false, error: "unavailable", message: offline };
  } finally {
    sending--;
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
