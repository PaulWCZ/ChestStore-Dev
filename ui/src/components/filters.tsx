"use client";

// Filters: chips kept in the address (a filtered list is a link one can
// share, and Back works), each with its count, one tap to choose, a second
// to let go, and "Clear filters" when any is on. Plain links: they work
// before any script and from a server component.
//
// SearchBox: a search form (GET, the address keeps the words) with "/" to
// reach it from anywhere on the page but a text field.
import { useEffect, useId, useRef, type ReactElement, type ReactNode } from "react";
import { SearchIcon } from "./icons.js";
import { activeFilters, clearHref, filterHref, paramOf } from "./lists.js";
import { isEditable } from "./text.js";
import { en, type FilterWords, type SearchWords } from "./words.js";

export type FilterOption = { readonly value: string; readonly label: string; readonly count?: number };
export type FilterGroup = {
  readonly key: string;
  readonly label: string;
  readonly options: readonly FilterOption[];
  // Show an "All" chip first (the group's filter off).
  readonly all?: boolean;
};

type Params = string | URLSearchParams | Readonly<Record<string, string | undefined>>;
type LinkLike = (props: { href: string; className?: string; "aria-current"?: "true"; children: ReactNode }) => ReactElement;

export type FiltersProps = {
  readonly path: string;
  readonly params: Params;
  readonly groups: readonly FilterGroup[];
  readonly labels?: FilterWords;
  // Next.js's <Link> (client navigation), or plain <a> by default.
  readonly link?: LinkLike;
};

export function Filters({ path, params, groups, labels = en.filters, link }: FiltersProps): ReactElement {
  const keys = groups.map(g => g.key);
  const on = activeFilters(params, keys);
  const A: LinkLike = link ?? (props => <a {...props} />);
  return (
    <div className="ck-filters" role="group" aria-label={labels.label}>
      {groups.map(g => {
        const chosen = paramOf(params, g.key);
        return (
          <nav key={g.key} className="ck-filter-group" aria-label={g.label}>
            <span className="ck-filter-label" aria-hidden="true">{g.label}</span>
            <ul>
              {g.all && (
                <li>
                  <A href={filterHref(path, params, g.key, null)} className="ck-filter-chip" {...(chosen === null ? { "aria-current": "true" as const } : {})}>{labels.all}</A>
                </li>
              )}
              {g.options.map(o => (
                <li key={o.value}>
                  <A href={filterHref(path, params, g.key, o.value)} className="ck-filter-chip" {...(chosen === o.value ? { "aria-current": "true" as const } : {})}>
                    <span>{o.label}</span>
                    {o.count !== undefined && <span className="ck-count">{o.count}</span>}
                  </A>
                </li>
              ))}
            </ul>
          </nav>
        );
      })}
      {on > 0 && <A href={clearHref(path, params, keys)} className="ck-filter-clear">{labels.clear}</A>}
    </div>
  );
}

export type SearchBoxProps = {
  // Where the form goes (the list's own page, or a results page).
  readonly action: string;
  readonly value?: string;
  readonly name?: string;
  // Other parameters to keep (the filters): hidden fields.
  readonly keep?: Readonly<Record<string, string | undefined>>;
  // "/" focuses this box (only one per page should have it).
  readonly shortcut?: boolean;
  readonly labels?: SearchWords;
  readonly placeholder?: string;
  // Client-side search instead of a page load (the value as one types).
  readonly onSearch?: (query: string) => void;
  readonly id?: string;
};

export function SearchBox({ action, value = "", name = "q", keep = {}, shortcut = true, labels = en.search, placeholder, onSearch, id }: SearchBoxProps): ReactElement {
  const auto = useId();
  const fieldId = id ?? auto + "-q";
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!shortcut) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey || isEditable(e.target)) return;
      const box = field.current;
      if (!box || box.offsetParent === null) return;
      e.preventDefault();
      box.focus();
      box.select();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [shortcut]);
  return (
    // One text field: Enter sends the form (no hidden button to tab onto).
    <form className="ck-search" role="search" aria-label={labels.label} action={action} method="get" onSubmit={onSearch ? e => { e.preventDefault(); onSearch(field.current?.value ?? ""); } : undefined}>
      {Object.entries(keep).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      <label htmlFor={fieldId} className="ck-vh">{labels.label}</label>
      <SearchIcon />
      <input
        ref={field}
        id={fieldId}
        className="ck-field ck-search-input"
        type="search"
        name={name}
        defaultValue={value}
        placeholder={placeholder ?? labels.placeholder}
        autoComplete="off"
        enterKeyHint="search"
        aria-keyshortcuts={shortcut ? "/" : undefined}
        onChange={onSearch ? e => onSearch(e.target.value) : undefined}
      />
      {shortcut && <kbd className="ck-kbd" title={labels.shortcut} aria-hidden="true">/</kbd>}
    </form>
  );
}
