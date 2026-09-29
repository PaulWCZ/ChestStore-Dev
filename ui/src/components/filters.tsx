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
import { clearHref, clearValues, filterHref, filterValues, paramEntries, paramOf, paramValues } from "./lists.js";
import { isEditable } from "./text.js";
import { en, type FilterWords, type SearchWords } from "./words.js";

export type FilterOption = {
  readonly value: string;
  readonly label: string;
  readonly count?: number;
  // A select group's section ("Laptops" under "Hardware"): the options of
  // one section are gathered under its name (an <optgroup>), in the order
  // the sections first appear; options without one come first. Chips
  // ignore it (0.2.3).
  readonly group?: string;
};
export type FilterGroup = {
  readonly key: string;
  readonly label: string;
  readonly options: readonly FilterOption[];
  // Show an "All" chip first (the group's filter off).
  readonly all?: boolean;
  // The words of that "All" chip, or of a select's empty choice, for this
  // group ("Anyone", "Every category"); the kit's "All" when absent (0.2.3).
  readonly allLabel?: string;
  // Several values at once, kept comma-separated in the address
  // ("f=screen,dock"); each chip adds or takes away its own (0.2.1).
  // Values must not contain a comma.
  readonly multiple?: boolean;
  // One value is always chosen (a view, a period): no "All", a chip is not
  // let go by a second tap, and "Clear filters" leaves this group alone
  // (0.2.1). `value` is the chosen one when the address names none.
  readonly required?: boolean;
  readonly value?: string;
  // "chips" (default) or "select": a list to choose from, for a group of
  // many options (a category among 30, a person) — one value; it goes to
  // its address when chosen (0.2.2).
  readonly as?: "chips" | "select";
};

type Params = string | URLSearchParams | Readonly<Record<string, string | undefined>>;
type LinkLike = (props: { href: string; className?: string; "aria-current"?: "true"; children: ReactNode }) => ReactNode;

export type FiltersProps = {
  // The list's page (address mode). Not needed in the in-page mode.
  readonly path?: string;
  // The address's parameters (address mode), or the current values.
  readonly params?: Params;
  readonly groups: readonly FilterGroup[];
  readonly labels?: FilterWords;
  // Next.js's <Link> (client navigation), or plain <a> by default.
  readonly link?: LinkLike;
  // Other parameters "Clear filters" takes away too, and that make it
  // appear (a date range, the search) (0.2.2).
  readonly clearAlso?: readonly string[];
  // On a phone: "wrap" (default) the chips on several lines, or "scroll":
  // each group on one line that scrolls sideways (0.2.2).
  readonly phone?: "wrap" | "scroll";
  // Where a select group goes when chosen (Next.js: router.push); without
  // it, its form is sent (a page load). From a client component (0.2.2).
  readonly onNavigate?: (href: string) => void;
  // The in-page mode (0.2.3): the filters are the page's state, not the
  // address — a list filtered in a dialog, a panel, a form. `value` holds
  // the current values ({ state: "sent,late", owner: "mbr_…" }); a chip
  // is a button (aria-pressed), a select and "Clear filters" call
  // onChange with the next values (the same rules as the address: a chip
  // toggles, several values comma-separated, a required group kept).
  // From a client component.
  readonly value?: Readonly<Record<string, string | undefined>>;
  readonly onChange?: (next: Record<string, string>) => void;
  readonly className?: string;
};

// Options of a select, gathered by their section (an optgroup each), the
// sections in the order they first appear, the options without one first.
function sections(options: readonly FilterOption[]): { label: string | null; options: FilterOption[] }[] {
  const out: { label: string | null; options: FilterOption[] }[] = [{ label: null, options: [] }];
  for (const o of options) {
    const label = o.group ?? null;
    let at = out.find(s => s.label === label);
    if (!at) { at = { label, options: [] }; out.push(at); }
    at.options.push(o);
  }
  return out.filter(s => s.options.length > 0);
}

export function Filters({ path = "", params, groups, labels = en.filters, link, clearAlso = [], phone = "wrap", onNavigate, value, onChange, className }: FiltersProps): ReactElement {
  const inPage = onChange !== undefined;
  const current: Params = (inPage ? value ?? params : params) ?? "";
  // "Clear filters" takes away what may be taken away: not a required group.
  const keys = [...groups.filter(g => !g.required).map(g => g.key), ...clearAlso.filter(k => !groups.some(g => g.key === k))];
  const on = keys.filter(k => paramOf(current, k) !== null);
  // One select on, and nothing else: its own "All" lets it go — a second
  // way to do the same would only be noise (0.2.3).
  const onlySelect = on.length === 1 && groups.some(g => g.key === on[0] && g.as === "select" && !g.required);
  const A: LinkLike = link ?? (props => <a {...props} />);
  const base = useId();
  const optionText = (o: FilterOption) => (o.count !== undefined ? `${o.label} (${o.count})` : o.label);
  return (
    <div className={`ck-filters${phone === "scroll" ? " ck-filters-scroll" : ""}${className ? " " + className : ""}`} role="group" aria-label={labels.label}>
      {groups.map(g => {
        const required = g.required ?? false;
        const multiple = !required && (g.multiple ?? false) && g.as !== "select";
        const chosen = multiple ? paramValues(current, g.key) : [paramOf(current, g.key) ?? (required ? g.value ?? null : null)].filter((v): v is string => v !== null);
        const all = g.allLabel ?? labels.all;
        if (g.as === "select") {
          const id = `${base}-${g.key}`;
          const picked = chosen[0] ?? "";
          const choices = sections(g.options).map(s => {
            const items = s.options.map(o => <option key={o.value} value={o.value}>{optionText(o)}</option>);
            return s.label === null ? items : <optgroup key={"g-" + s.label} label={s.label}>{items}</optgroup>;
          });
          if (inPage) {
            return (
              <div key={g.key} className="ck-filter-group ck-filter-select">
                <label className="ck-filter-label" htmlFor={id}>{g.label}</label>
                <select id={id} className="ck-field ck-select" value={picked}
                  onChange={e => { const v = e.currentTarget.value; onChange(filterValues(current, g.key, v === "" ? null : v, { required: true })); }}>
                  {!required && <option value="">{all}</option>}
                  {choices}
                </select>
              </div>
            );
          }
          return (
            <form key={g.key} className="ck-filter-group ck-filter-select" action={path} method="get" onSubmit={onNavigate ? e => { e.preventDefault(); } : undefined}>
              {paramEntries(current, [g.key, "page", "cursor"]).map(([k, v], i) => <input key={`${k}-${i}`} type="hidden" name={k} value={v} />)}
              <label className="ck-filter-label" htmlFor={id}>{g.label}</label>
              <select key={picked} id={id} className="ck-field ck-select" name={g.key} defaultValue={picked}
                onChange={e => {
                  const v = e.currentTarget.value;
                  if (onNavigate) onNavigate(filterHref(path, current, g.key, v === "" ? null : v, { required: true }));
                  else e.currentTarget.form?.requestSubmit();
                }}>
                {!required && <option value="">{all}</option>}
                {choices}
              </select>
              <noscript><button type="submit" className="ck-button ck-button-quiet">{labels.apply ?? en.filters.apply}</button></noscript>
            </form>
          );
        }
        const chip = (key: string, target: string | null, pressed: boolean, content: ReactNode) => inPage
          ? <button key={key} type="button" className="ck-filter-chip" aria-pressed={pressed} onClick={() => onChange(filterValues(current, g.key, target, { multiple, required }))}>{content}</button>
          : <A href={filterHref(path, current, g.key, target, { multiple, required })} className="ck-filter-chip" {...(pressed ? { "aria-current": "true" as const } : {})}>{content}</A>;
        const Box = inPage ? "div" : "nav";
        return (
          <Box key={g.key} className="ck-filter-group" {...(inPage ? { role: "group" } : {})} aria-label={g.label}>
            <span className="ck-filter-label" aria-hidden="true">{g.label}</span>
            <ul>
              {g.all && !required && <li>{chip("all", null, chosen.length === 0, all)}</li>}
              {g.options.map(o => (
                <li key={o.value}>
                  {chip(o.value, o.value, chosen.includes(o.value), <><span>{o.label}</span>{o.count !== undefined && <span className="ck-count">{o.count}</span>}</>)}
                </li>
              ))}
            </ul>
          </Box>
        );
      })}
      {on.length > 0 && !onlySelect && (inPage
        ? <button type="button" className="ck-filter-clear" onClick={() => onChange(clearValues(current, keys))}>{labels.clear}</button>
        : <A href={clearHref(path, current, keys)} className="ck-filter-clear">{labels.clear}</A>)}
    </div>
  );
}

export type SearchBoxProps = {
  // Where the form goes (the list's own page, or a results page).
  readonly action: string;
  readonly value?: string;
  readonly name?: string;
  // Other parameters to keep (the filters): hidden fields.
  // Several values of one parameter as a list (0.2.2).
  readonly keep?: Readonly<Record<string, string | readonly string[] | undefined>>;
  // "/" focuses this box (only one per page should have it).
  readonly shortcut?: boolean;
  readonly labels?: SearchWords;
  readonly placeholder?: string;
  // Client-side search instead of a page load (the value as one types).
  readonly onSearch?: (query: string) => void;
  readonly id?: string;
  // The longest query one can type (default 200 characters): a search
  // never needs more, and the tool's server need not read a novel (0.2.1).
  readonly maxLength?: number;
  // Focus the box when the page opens (a search page); never on a page
  // whose first job is something else (0.2.1).
  readonly autoFocus?: boolean;
  // The shortest query (the browser says so before sending), and a search
  // that must not be sent empty (0.2.2).
  readonly minLength?: number;
  readonly required?: boolean;
  readonly className?: string;
};

export function SearchBox({ action, value = "", name = "q", keep = {}, shortcut = true, labels = en.search, placeholder, onSearch, id, maxLength = 200, autoFocus = false, minLength, required = false, className }: SearchBoxProps): ReactElement {
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
    <form className={`ck-search${className ? " " + className : ""}`} role="search" aria-label={labels.label} action={action} method="get" onSubmit={onSearch ? e => { e.preventDefault(); onSearch(field.current?.value ?? ""); } : undefined}>
      {Object.entries(keep).flatMap(([k, v]) => (typeof v === "string" ? [v] : v ?? []).filter(x => x !== "").map((x, i) => <input key={`${k}-${i}`} type="hidden" name={k} value={x} />))}
      <label htmlFor={fieldId} className="ck-vh">{labels.label}</label>
      <SearchIcon />
      <input
        ref={field}
        id={fieldId}
        className="ck-field ck-search-input"
        type="search"
        name={name}
        defaultValue={value.slice(0, maxLength)}
        maxLength={maxLength}
        minLength={minLength}
        required={required || undefined}
        autoFocus={autoFocus || undefined}
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
