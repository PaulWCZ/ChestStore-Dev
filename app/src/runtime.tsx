import { Toasts, useToast, type ShowToast } from "@argentic/chest-ui/components";
import type { ToastWords } from "@argentic/chest-ui/components/logic";
import { createElement, useEffect, type ComponentType } from "react";
import type { flushSync } from "react-dom";
import type { createRoot, hydrateRoot, Root } from "react-dom/client";
import type { RegisteredActions } from "./register.ts";
import type { Action, Outcome, SentOf } from "./tool.ts";
import { currentForm } from "./form.tsx";

// The browser's side (its public part is ./client.ts, for islands; the
// rest is for ./browser.tsx). Nothing here runs on import, and nothing
// loads react-dom/client.

// ---- Islands: hydrated on load, kept (state, focus) across refreshes.
let registry: Record<string, ComponentType<object>> = {};
export type ReactDom = { hydrateRoot: typeof hydrateRoot; createRoot: typeof createRoot; flushSync: typeof flushSync };
let dom: ReactDom;
const roots = new Map<Element, Root>();
const propsOf = (el: Element): object => JSON.parse(el.getAttribute("data-props") ?? "{}") as object;
// What the server put directly in <body>: a refresh changes only that;
// what a script added there (a portal, a live region) stays.
const served = new WeakSet<Node>();

export function startIslands(islands: Record<string, ComponentType<never>>, reactDom: ReactDom): void {
  registry = islands as typeof registry;
  dom = reactDom;
  for (const node of document.body.childNodes) served.add(node);
  for (const el of document.querySelectorAll("[data-island]")) mount(el);
  // Back and Forward between addresses navigate() made: the page follows,
  // at the scroll it was left at.
  history.scrollRestoration = "manual";
  addEventListener("popstate", event => {
    const scroll = (event.state as { scroll?: number } | null)?.scroll ?? 0;
    void refresh().then(shown => { if (shown) scrollTo(0, scroll); });
  });
}
// Each island is a root of its own, with the id prefix the server used.
// On load its HTML is hydrated. An island a refresh or a navigation brings
// (a card's panel opened) is rendered at once instead, its effects
// included, before the browser shows it: a key pressed the moment it
// appears (Escape) finds its listeners there, and its focus is set.
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
// what is typed, an open <details> or <dialog>, each island's state (it
// receives its new props). Items of a list keep their place by their id
// (or data-key). Never throws: true when the page was put in place.
// 401/403 (signed out, access removed): the page is loaded again, as the
// Chest shows it. Another error: a toast, the page kept as it is.
let latest = 0;
let moves = 0;
let sending = 0;
export function refresh(): Promise<boolean> {
  return load(location.href, false);
}

async function load(href: string, push: false | "push" | "replace"): Promise<boolean> {
  const ticket = ++latest;
  const move = push ? ++moves : moves;
  // A page read while an action is on its way may predate it: not shown
  // (the action's own refresh follows).
  const settled = sending === 0;
  let response: Response;
  let html: string | null = null;
  try {
    // x-tool-navigate: the server answers a file with 204 (its body never
    // made), and it is then loaded plainly — once.
    response = await fetch(href, { headers: { accept: "text/html", "x-tool-navigate": "1" } });
    if (response.headers.get("content-type")?.startsWith("text/html")) html = await response.text();
  } catch {
    if (ticket === latest) toast({ id: "refresh", text: words.unavailable, tone: "error" });
    return false;
  }
  if (!applies({ navigation: push !== false, ticket, latest, move, moves, settled, sending })) return false;
  // Signed out (401), access removed (403): the page loaded again, as the
  // Chest shows it.
  if (response.status === 401 || response.status === 403) {
    if (push) location.assign(href);
    else location.reload();
    return false;
  }
  // The server or the Chest failed (5xx, "Waking up…" included): the page
  // stays as it is, with what is typed; another page is loaded plainly.
  if (response.status >= 500) {
    if (push) location.assign(href);
    else toast({ id: "refresh", text: words.unavailable, tone: "error" });
    return false;
  }
  // Not a page (a file?): loaded plainly.
  if (html === null) {
    void response.body?.cancel();
    if (push) location.assign(href);
    else location.reload();
    return false;
  }
  // Another refusal (the page is gone: 404): the page loaded plainly, as
  // the server shows it.
  if (!response.ok && !push) {
    location.reload();
    return false;
  }
  const next = new DOMParser().parseFromString(html, "text/html");
  // The page left keeps its scroll in its history entry (Back finds it).
  if (push === "push") {
    history.replaceState({ scroll: scrollY }, "");
    history.pushState({ scroll: 0 }, "", response.url + hashOf(href, response));
  } else if (push === "replace" || response.redirected) history.replaceState({ scroll: scrollY }, "", response.url + hashOf(href, response));
  document.title = next.title;
  const form = next.querySelector<HTMLMetaElement>('meta[name="chest-form"]')?.content;
  if (form) setForm(form);
  const focused = document.activeElement;
  attributes(document.body, next.body);
  children(document.body, next.body);
  // The focused element went with what changed: the page's main region.
  // The focused element went with what changed: the page's main region —
  // unless an island the change brought took the focus itself (a panel
  // opened in place focuses its own first element).
  if (focusMain(focused, document.activeElement, document.body)) document.getElementById("main")?.focus({ preventScroll: true });
  return true;
}

// The page's form token, renewed: its <meta> and every form's field.
function setForm(token: string): void {
  let meta = document.querySelector<HTMLMetaElement>('meta[name="chest-form"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "chest-form";
    document.head.append(meta);
  }
  meta.content = token;
  for (const input of document.querySelectorAll<HTMLInputElement>('input[name="chest_form"]')) input.value = token;
}

// Whether a change put in place should move the focus to <main>: the
// element focused before went with it, and nothing new took the focus.
type Focusable = { isConnected: boolean } | null;
export function focusMain(before: Focusable, now: Focusable, body: Focusable): boolean {
  if (!before || before === body || before.isConnected) return false;
  return !now || now === body || !now.isConnected;
}

// The #place of the address asked, kept (a fetch's response.url has none),
// unless the server sent elsewhere.
const hashOf = (href: string, response: Response) => (response.redirected ? "" : new URL(href, location.href).hash);

// ---- navigate(): another page of the same part without loading it again:
// its HTML put in place as refresh() does, the address in the history,
// the top of the page in view, the layout's islands (a toast and its
// Undo) kept. Another part or another site: a plain page load.
// Whether a page read may be put in place when it arrives. A navigation is
// the person's own click: shown unless another navigation came after it —
// never dropped for a refresh or an action on its way. A refresh is shown
// only if it is the newest read, no navigation came since it started, and
// no action was or is on its way (its page may predate it).
export function applies(r: { navigation: boolean; ticket: number; latest: number; move: number; moves: number; settled: boolean; sending: number }): boolean {
  if (r.move !== r.moves) return false;
  if (r.navigation) return true;
  return r.ticket === r.latest && r.settled && r.sending === 0;
}

// top: false keeps the scroll and the focus where they are (a card opened
// beside its board, a filter); true (default) shows the new page's top and
// puts the focus at its start.
export async function navigate(to: string, { replace = false, top = true }: { replace?: boolean; top?: boolean } = {}): Promise<void> {
  const target = new URL(to, location.href);
  const members = (path: string) => path.split("/")[1]?.toLowerCase() === "chest";
  if (target.origin !== location.origin || members(target.pathname) !== members(location.pathname)) return location.assign(target.href);
  if (!(await load(target.href, replace ? "replace" : "push"))) return;
  if (!top) return;
  // A #place: there, as a page load would.
  const place = target.hash ? document.getElementById(decodeURIComponent(target.hash.slice(1))) : null;
  if (place) {
    place.scrollIntoView();
    if (!place.hasAttribute("tabindex") && !/^(A|BUTTON|INPUT|SELECT|TEXTAREA)$/u.test(place.tagName)) place.setAttribute("tabindex", "-1");
    place.focus({ preventScroll: true });
    return;
  }
  scrollTo(0, 0);
  // Focus at the new page's start: a screen reader reads its heading.
  const main = document.getElementById("main");
  const heading = main?.querySelector<HTMLElement>("h1");
  if (heading) {
    if (!heading.hasAttribute("tabindex")) heading.setAttribute("tabindex", "-1");
    heading.focus({ preventScroll: true });
  } else main?.focus({ preventScroll: true });
}

// The links between pages of the same part go through navigate() (start()
// listens): no page load, the layout's islands kept (a toast's Undo).
// A link stays a plain page load when: another site or part, a target or
// download, a modifier key or another button, a link to a place on the
// same page (#…), a file of /assets/ or an address ending with a file's
// extension (.csv, .zip, .ics…), or data-reload on the link (or an
// ancestor) — the opt-out.
export function intercepts(event: MouseEvent): HTMLAnchorElement | null {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  const link = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
  if (!link || link.closest("[data-reload]") || link.hasAttribute("download") || (link.target && link.target !== "_self")) return null;
  const to = new URL(link.href, location.href);
  const members = (path: string) => path.split("/")[1]?.toLowerCase() === "chest";
  if (to.origin !== location.origin || members(to.pathname) !== members(location.pathname)) return null;
  if (to.pathname.startsWith("/assets/") || to.pathname.startsWith("/lang/")) return null;
  // A file (export.csv, archive.zip, invite.ics): the browser downloads it.
  if (/\.[A-Za-z0-9]{1,5}$/u.test(to.pathname)) return null;
  if (to.hash && to.pathname === location.pathname && to.search === location.search) return null;
  return link;
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
    if (node.getAttribute("data-props") !== before) {
      const props = propsOf(node) as { id?: unknown };
      // The same island, at the same place, now about another thing: its
      // state (a draft, an open menu) belongs to the old one. Give the
      // island an id ("card-" + id) so it is replaced instead.
      if (process.env.NODE_ENV === "development" && before && !node.id) {
        const old = JSON.parse(before) as { id?: unknown };
        if (old.id !== undefined && old.id !== props.id) console.warn(`chest-app: the island ${node.getAttribute("data-island")} now shows id ${String(props.id)} instead of ${String(old.id)} but kept its state: give it an id, <Island id={"…-" + id} …/>`);
      }
      root.render(createElement(registry[node.getAttribute("data-island")!]!, props as object));
    }
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

export function call<N extends Name>(name: N, input: In<RegisteredActions[N]>, options: { refresh?: boolean; quiet?: boolean; at?: string; parallel?: boolean } = {}): Promise<Outcome<Out<RegisteredActions[N]>>> {
  const members = location.pathname.split("/")[1]?.toLowerCase() === "chest";
  const base = options.at !== undefined ? options.at.replace(/\/$/u, "") : members ? "/chest" : "";
  return send(`${base}/actions/${name}`, { "content-type": "application/json" }, JSON.stringify(input), options);
}

// What call() and the enhanced forms share: the request, its outcome, the
// redirect or the refresh, the toast. Never throws.
// Actions are sent one at a time, in the order asked (as Next.js's server
// actions were): two that read then write (a position, a count) never
// interleave. parallel: true sends one at once, for calls that touch
// nothing in common (a search, a preview).
// An action declared parallel on the server (action(…, { parallel: true }):
// a slow one — AI, an import, an upload) is listed in the page's
// <meta name="chest-parallel">; a form says data-parallel. The queue moves
// on once an action is answered (its refresh does not hold the next), and
// after 30 seconds at most.
let queue: Promise<unknown> = Promise.resolve();
const parallelActions = (): string[] => (document.querySelector<HTMLMetaElement>('meta[name="chest-parallel"]')?.content ?? "").split(",").filter(Boolean);
const actionOf = (url: string) => /\/actions\/([A-Za-z0-9_]+)$/u.exec(new URL(url, location.href).pathname)?.[1] ?? "";
export function send<T>(url: string, headers: Record<string, string>, body: BodyInit, options: { refresh?: boolean; quiet?: boolean; parallel?: boolean } = {}): Promise<Outcome<T> & { redirect?: string }> {
  const parallel = options.parallel ?? parallelActions().includes(actionOf(url));
  if (parallel) return request<T>(url, headers, body).then(outcome => answered(outcome, options));
  const asked = queue.then(() => request<T>(url, headers, body));
  queue = Promise.race([asked.catch(() => undefined), new Promise(resolve => setTimeout(resolve, 30_000))]);
  return asked.then(outcome => answered(outcome, options));
}
async function request<T>(url: string, headers: Record<string, string>, body: BodyInit): Promise<Outcome<T> & { redirect?: string }> {
  let outcome: Outcome<T> & { redirect?: string };
  const refused = (message: string, error = "unavailable") => ({ ok: false, error, message }) as typeof outcome;
  sending++;
  try {
    // A public page's form token (a bounded action requires it).
    const form = currentForm();
    const response = await fetch(url, { method: "POST", headers: { ...headers, "x-tool-action": "1", ...(form ? { "x-chest-form": form } : {}) }, body });
    if (response.headers.get("content-type")?.startsWith("application/json")) {
      outcome = await response.json() as typeof outcome;
      // The token served once: the answer brings the next one.
      const next = (outcome as { form?: unknown }).form;
      if (typeof next === "string") setForm(next);
    } else {
      void response.body?.cancel();
      if (response.status === 401 || response.status === 403) {
        // Signed out, or the Chest's "Access removed": its page, loaded again.
        location.reload();
        outcome = refused(words.unavailable);
      } else if (response.status === 413) outcome = refused(words.tooLarge ?? words.unavailable, "too_large");
      else if (response.status === 429) outcome = refused(words.limit ?? words.unavailable, "limit");
      else outcome = refused(words.unavailable);
    }
  } catch {
    outcome = refused(words.unavailable);
  } finally {
    sending--;
  }
  return outcome;
}
async function answered<T>(outcome: Outcome<T> & { redirect?: string }, options: { refresh?: boolean; quiet?: boolean }): Promise<Outcome<T> & { redirect?: string }> {
  if (outcome.ok && outcome.redirect) await navigate(outcome.redirect);
  else if (outcome.ok && options.refresh !== false) await refresh();
  if (!outcome.ok && !options.quiet) toast({ text: outcome.message, tone: "error" });
  return outcome;
}

// ---- toast(): the kit's toasts (Undo, errors) from anywhere in the
// browser. <ToastHost> is an island of every layout.
let show: ShowToast | null = null;
const waiting: Parameters<ShowToast>[0][] = [];
// tooLarge, limit: what a refusal of the Chest's front (413, 429, not the
// tool's JSON) says; the layout passes t.errors.too_large (and limit).
let words: { unavailable: string; busy: string; tooLarge?: string; limit?: string } = { unavailable: "The Chest did not answer. Try again in a moment.", busy: "Still sending…" };
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
export function ToastHost({ labels, words: said }: { labels: ToastWords; words: { unavailable: string; busy: string; tooLarge?: string; limit?: string } }) {
  words = said;
  return <Toasts labels={labels}><Bridge /></Toasts>;
}
