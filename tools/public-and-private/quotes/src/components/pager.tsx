import { numberFormat } from "../i18n/format.ts";
import { format, intl, type Catalogue, type Locale } from "../i18n/index.ts";

// A long list goes by pages (an island takes one page as its props:
// studio.6 bounds them): newer or previous, where we are, older or next.
// Plain links, written on the server; the page's address keeps its
// filters. Nothing when everything fits on one page.
export const pageSize = 200;

// The page asked for (?page=), within 1 and the last.
export function pageOf(query: string | undefined, count: number): { page: number; pages: number; offset: number } {
  const pages = Math.max(1, Math.ceil(count / pageSize));
  const page = Math.min(pages, Math.max(1, Number.parseInt(query ?? "1", 10) || 1));
  return { page, pages, offset: (page - 1) * pageSize };
}

export function Pager({ path, params, page, pages, shown, count, words, locale, back, next }: {
  path: string;
  params: Record<string, string>;
  page: number;
  pages: number;
  shown: number;
  count: number;
  words: Catalogue["list"];
  locale: Locale;
  // The links' words: "← Newer" / "Older →" for documents, "← Previous" /
  // "Next →" for a list by name.
  back: string;
  next: string;
}) {
  if (pages <= 1) return null;
  const n = (value: number) => numberFormat(intl(locale)).format(value);
  const href = (to: number) => {
    const query = new URLSearchParams({ ...params, ...(to > 1 ? { page: String(to) } : {}) }).toString();
    return query ? `${path}?${query}` : path;
  };
  const from = (page - 1) * pageSize + 1;
  return (
    <nav className="pager" aria-label={words.pagesLabel}>
      {page > 1 ? <a className="button quiet" href={href(page - 1)} rel="prev">{back}</a> : <span />}
      <span className="muted">{format(words.range, { from: n(from), to: n(from + shown - 1), count: n(count) })}</span>
      {page < pages ? <a className="button quiet" href={href(page + 1)} rel="next">{next}</a> : <span />}
    </nav>
  );
}
