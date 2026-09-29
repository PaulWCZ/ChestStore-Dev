// Tables, filters and navigation as pure functions: sorting, the address
// of a filter, the page a link names. Server components and client ones
// use the same rules.
import { compareText } from "./text.js";

export type SortDir = "asc" | "desc";
export type Sort = { readonly key: string; readonly dir: SortDir };

// nextSort: a click on a column sorts by it (ascending), a second click
// reverses it.
export function nextSort(current: Sort | null | undefined, key: string, first: SortDir = "asc"): Sort {
  if (current && current.key === key) return { key, dir: current.dir === "asc" ? "desc" : "asc" };
  return { key, dir: first };
}

export function ariaSort(current: Sort | null | undefined, key: string): "ascending" | "descending" | "none" {
  if (!current || current.key !== key) return "none";
  return current.dir === "asc" ? "ascending" : "descending";
}

export type SortValue = string | number | boolean | Date | null | undefined;

export function compareValues(a: SortValue, b: SortValue): number {
  const emptyA = a === null || a === undefined || a === "";
  const emptyB = b === null || b === undefined || b === "";
  if (emptyA || emptyB) return emptyA === emptyB ? 0 : emptyA ? 1 : -1;
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);
  return compareText(String(a), String(b));
}

// sortRows: a stable sort by one value; empty values last in both
// directions (a missing date never tops a list).
export function sortRows<R>(rows: readonly R[], value: (row: R) => SortValue, dir: SortDir): R[] {
  return rows
    .map((row, index) => ({ row, index, v: value(row) }))
    .sort((x, y) => {
      const emptyX = x.v === null || x.v === undefined || x.v === "";
      const emptyY = y.v === null || y.v === undefined || y.v === "";
      if (emptyX !== emptyY) return emptyX ? 1 : -1;
      const c = compareValues(x.v, y.v);
      return (dir === "asc" ? c : -c) || x.index - y.index;
    })
    .map(x => x.row);
}

type ParamsLike = string | URLSearchParams | Readonly<Record<string, string | undefined>>;

function paramsOf(params: ParamsLike): URLSearchParams {
  if (typeof params === "string") return new URLSearchParams(params.startsWith("?") ? params.slice(1) : params);
  if (params instanceof URLSearchParams) return new URLSearchParams(params.toString());
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") p.set(k, v);
  return p;
}

// paramEntries: the address's parameters as [key, value] pairs, without
// `drop` (a select filter's form keeps the others in hidden fields).
export function paramEntries(params: ParamsLike, drop: readonly string[] = []): [string, string][] {
  return [...paramsOf(params).entries()].filter(([k, v]) => !drop.includes(k) && v !== "");
}

function hrefOf(path: string, p: URLSearchParams): string {
  const q = p.toString();
  return q ? `${path}?${q}` : path;
}

// filterHref: the address that shows the list with key=value — or without
// that filter when it is the one already chosen (a chip toggles). The page
// number goes (a new filter starts at the first page); everything else
// (the search, the other filters) stays: a filtered list is a link one can
// share, and Back works.
//
// `multiple`: the key holds several values, comma-separated
// ("f=screen,dock"); a chip adds its value or takes it away, the others
// stay. Values of such a group must not contain a comma.
//
// `required`: one value is always chosen: a chip sets its value, choosing
// it again keeps it (no toggle-off).
export function filterHref(path: string, params: ParamsLike, key: string, value: string | null, { resetKeys = ["page", "cursor"], multiple = false, required = false }: { resetKeys?: readonly string[]; multiple?: boolean; required?: boolean } = {}): string {
  const p = paramsOf(params);
  for (const k of resetKeys) p.delete(k);
  if (value === null || value === "") p.delete(key);
  else if (required) p.set(key, value);
  else if (multiple) {
    const now = paramValues(p, key);
    const next = now.includes(value) ? now.filter(v => v !== value) : [...now, value];
    if (next.length === 0) p.delete(key);
    else p.set(key, next.join(","));
  } else if (p.get(key) === value) p.delete(key);
  else p.set(key, value);
  return hrefOf(path, p);
}

// paramValues: the values of a multiple filter ("screen,dock" → ["screen",
// "dock"]), without empties or repeats.
export function paramValues(params: ParamsLike, key: string): string[] {
  const v = paramsOf(params).get(key) ?? "";
  return [...new Set(v.split(",").map(x => x.trim()).filter(x => x !== ""))];
}

// clearHref: the list without any of these filters (the search stays).
export function clearHref(path: string, params: ParamsLike, keys: readonly string[], { resetKeys = ["page", "cursor"] }: { resetKeys?: readonly string[] } = {}): string {
  const p = paramsOf(params);
  for (const k of [...keys, ...resetKeys]) p.delete(k);
  return hrefOf(path, p);
}

// filterValues and clearValues: the same rules as filterHref and
// clearHref, for filters kept in the page rather than in the address
// (Filters' in-page mode, 0.2.3): the next values, as a plain record.
const valuesOf = (href: string): Record<string, string> => Object.fromEntries(new URLSearchParams(href.includes("?") ? href.slice(href.indexOf("?") + 1) : "").entries());
export function filterValues(params: ParamsLike, key: string, value: string | null, options: { resetKeys?: readonly string[]; multiple?: boolean; required?: boolean } = {}): Record<string, string> {
  return valuesOf(filterHref("", params, key, value, options));
}
export function clearValues(params: ParamsLike, keys: readonly string[], options: { resetKeys?: readonly string[] } = {}): Record<string, string> {
  return valuesOf(clearHref("", params, keys, options));
}

export function activeFilters(params: ParamsLike, keys: readonly string[]): number {
  const p = paramsOf(params);
  return keys.filter(k => (p.get(k) ?? "") !== "").length;
}

export function paramOf(params: ParamsLike, key: string): string | null {
  const v = paramsOf(params).get(key);
  return v === null || v === "" ? null : v;
}

// How a link decides it names the page shown. `match`: "exact" (this path
// only) or "prefix" (this path and its sub-pages); by default a section is
// "prefix", but the root of the tool ("/chest", "/") is "exact" — else it
// would be current everywhere. `exact: true` is the older spelling of
// match "exact". `also`: other path prefixes that make it current too (a
// "Bookings" tab current on "/chest/new" and on "/chest/b/42").
export type CurrentRule = { readonly match?: "exact" | "prefix"; readonly exact?: boolean; readonly also?: readonly string[] };

const cleanPath = (s: string) => (s.length > 1 ? s.replace(/[?#].*$/u, "").replace(/\/+$/u, "") : s) || "/";
const under = (p: string, prefix: string) => p === prefix || p.startsWith(prefix === "/" ? "/" : prefix + "/");

// isCurrent: does this link name the page shown? A section's link stays
// current on its sub-pages ("/chest/boards" on "/chest/boards/42"), unless
// exact; the root of the tool ("/chest") is exact unless match is "prefix".
// The third argument is `exact` (a boolean, as in 0.2.0) or a rule.
export function isCurrent(path: string, href: string, rule: boolean | CurrentRule = false): boolean {
  const { match, exact = false, also = [] } = typeof rule === "boolean" ? { exact: rule } : rule;
  const p = cleanPath(path);
  const h = cleanPath(href);
  const how = match ?? (exact || h === "/chest" || h === "/" ? "exact" : "prefix");
  if (how === "exact" ? p === h : under(p, h)) return true;
  return also.some(a => under(p, cleanPath(a)));
}
