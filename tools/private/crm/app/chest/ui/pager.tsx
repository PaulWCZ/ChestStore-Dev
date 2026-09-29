import Link from "next/link";
import { Back, Next } from "../../../components/icons.tsx";
import { format } from "../../../lib/i18n/format.ts";
import type { Catalogue, Locale } from "../../../lib/i18n/index.ts";
import { intl } from "../../../lib/i18n/format.ts";

// The pages of a long list: "101–200 of 2,500", previous and next, with the
// list's filters kept in the address.
export function Pager({ path, params, page, pageSize, total, locale, t }: { path: string; params: Record<string, string>; page: number; pageSize: number; total: number; locale: Locale; t: Catalogue }) {
  if (total <= pageSize && page === 1) return null;
  const n = new Intl.NumberFormat(intl(locale));
  const from = Math.min(total, (page - 1) * pageSize + 1), to = Math.min(total, page * pageSize);
  const href = (p: number) => {
    const q = new URLSearchParams(Object.entries({ ...params, page: p > 1 ? String(p) : "" }).filter(([, v]) => v !== ""));
    return `${path}${q.size ? "?" + q.toString() : ""}`;
  };
  return (
    <nav className="pager" aria-label={format(t.common.range, { from: n.format(from), to: n.format(to), total: n.format(total) })}>
      {page > 1 ? <Link prefetch={false} className="button small quiet" href={href(page - 1)} rel="prev"><Back />{t.common.previous}</Link> : <span />}
      <span className="num muted small-text">{format(t.common.range, { from: n.format(from), to: n.format(to), total: n.format(total) })}</span>
      {to < total ? <Link prefetch={false} className="button small quiet" href={href(page + 1)} rel="next">{t.common.next}<Next /></Link> : <span />}
    </nav>
  );
}
