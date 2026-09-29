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

function hrefOf(path: string, p: URLSearchParams): string {
  const q = p.toString();
  return q ? `${path}?${q}` : path;
}

// filterHref: the address that shows the list with key=value — or without
// that filter when it is the one already chosen (a chip toggles). The page
// number goes (a new filter starts at the first page); everything else
// (the search, the other filters) stays: a filtered list is a link one can
// share, and Back works.
export function filterHref(path: string, params: ParamsLike, key: string, value: string | null, { resetKeys = ["page", "cursor"] }: { resetKeys?: readonly string[] } = {}): string {
  const p = paramsOf(params);
  for (const k of resetKeys) p.delete(k);
  if (value === null || value === "" || p.get(key) === value) p.delete(key);
  else p.set(key, value);
  return hrefOf(path, p);
}

// clearHref: the list without any of these filters (the search stays).
export function clearHref(path: string, params: ParamsLike, keys: readonly string[], { resetKeys = ["page", "cursor"] }: { resetKeys?: readonly string[] } = {}): string {
  const p = paramsOf(params);
  for (const k of [...keys, ...resetKeys]) p.delete(k);
  return hrefOf(path, p);
}

export function activeFilters(params: ParamsLike, keys: readonly string[]): number {
  const p = paramsOf(params);
  return keys.filter(k => (p.get(k) ?? "") !== "").length;
}

export function paramOf(params: ParamsLike, key: string): string | null {
  const v = paramsOf(params).get(key);
  return v === null || v === "" ? null : v;
}

// isCurrent: does this link name the page shown? A section's link stays
// current on its sub-pages ("/chest/boards" on "/chest/boards/42"), unless
// exact; the root of the tool ("/chest") is always exact.
export function isCurrent(path: string, href: string, exact = false): boolean {
  const clean = (s: string) => (s.length > 1 ? s.replace(/[?#].*$/u, "").replace(/\/+$/u, "") : s) || "/";
  const p = clean(path);
  const h = clean(href);
  if (exact || h === "/chest" || h === "/") return p === h;
  return p === h || p.startsWith(h + "/");
}
