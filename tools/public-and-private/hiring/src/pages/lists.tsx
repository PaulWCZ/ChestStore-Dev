import { notFound, type MemberContext, type PageContext, type View } from "@argentic/chest-app";
import { EmptyState, PageHeader, SearchBox, StatusBadge } from "@argentic/chest-ui/components";
import { Bin, Download } from "../components/icons.tsx";
import { localeOf, type Catalogue, type Locale } from "../i18n/index.ts";
import { can } from "../lib/access.ts";
import { pool, search, type Found } from "../lib/candidates.ts";
import { db } from "../lib/db.ts";
import { unmatched } from "../lib/messages.ts";
import { report } from "../lib/reports.ts";
import { dayLabel, format, formatDate, plural } from "../shared/format.ts";
import { stageLabel } from "../shared/stages.ts";

// The team's lists: a search across the jobs, the talent pool, the
// reports, the emails to file.

// Candidates found (a search, the talent pool): name, job, where they
// are, when they applied.
function FoundList({ list, locale, zone, t }: { list: Found[]; locale: Locale; zone: string; t: Catalogue }) {
  return (
    <ul className="found-list">
      {list.map(f => (
        <li key={f.id} id={`found-${f.id}`}>
          <a href={`/chest/candidates/${f.id}`} className="found-main">
            <span className="found-name">{f.name}</span>
            <span className="muted small">{[f.email, f.jobTitle].filter(Boolean).join(" · ")}</span>
          </a>
          <StatusBadge tone={f.status === "rejected" ? "danger" : "info"} size="s" label={f.status === "rejected" ? t.export.status.rejected : stageLabel(f.stage, t.jobSettings.defaults)} />
          <span className="muted small found-date">{formatDate(f.createdAt, locale, zone, { day: "numeric", month: "short", year: "numeric" })}</span>
        </li>
      ))}
    </ul>
  );
}

const searchWords = (t: Catalogue, label: string) => ({ label, placeholder: label, shortcut: t.search.shortcut, submit: t.search.go });

// Finding a candidate across every job the reader may see: "where is the
// CV of that Lucie who applied in May?"
export async function searchPage({ member, t, locale: tag, f, query }: PageContext<MemberContext>): Promise<View> {
  const locale = localeOf(tag);
  const q = (query("q") ?? "").slice(0, 100);
  const found = q.trim().length >= 2 ? await search(db(), member, q) : [];
  return {
    title: t.search.title,
    body: (
      <div className="narrow">
        <PageHeader title={t.search.title} />
        <div className="search-form">
          <SearchBox action="/chest/search" value={q} id="q" shortcut={false} labels={{ label: t.search.label, placeholder: t.search.placeholder, shortcut: t.search.shortcut, submit: t.search.go }} />
        </div>
        {q.trim().length < 2 ? <p className="muted">{t.search.hint}</p>
          : found.length === 0 ? <p className="muted" role="status">{format(t.search.none, { q })}</p>
            : (
              <>
                <p className="muted" role="status">{plural(t.search.results, found.length, locale)}</p>
                <FoundList list={found} locale={locale} zone={f.timeZone} t={t} />
              </>
            )}
      </div>
    ),
  };
}

// The talent pool: people who agreed to be kept in mind for other jobs,
// each once. From a person's page, "Propose for another job".
export async function poolPage({ member, t, locale: tag, f, query }: PageContext<MemberContext>): Promise<View> {
  if (!can(member, "candidates.manage")) notFound();
  const locale = localeOf(tag);
  const q = (query("q") ?? "").slice(0, 100);
  const list = await pool(db(), member, q);
  return {
    title: t.pool.title,
    body: (
      <div className="narrow">
        <PageHeader title={t.pool.title} intro={t.pool.intro} />
        <div className="search-form">
          <SearchBox action="/chest/pool" value={q} id="pool-q" shortcut={false} labels={searchWords(t, t.pool.filter)} />
        </div>
        {list.length === 0 ? <EmptyState title={q ? t.pool.noneFound : t.pool.emptyTitle} body={t.pool.emptyBody} /> : (
          <>
            <p className="muted">{plural(t.pool.count, list.length, locale)}</p>
            <FoundList list={list} locale={locale} zone={f.timeZone} t={t} />
          </>
        )}
      </div>
    ),
  };
}

// How hiring goes: for every job, or one — counts only (no person is
// scored here). A bar is an SVG of its share, never a style.
export async function reportsPage({ member, t, locale: tag, query }: PageContext<MemberContext>): Promise<View> {
  if (!can(member, "export")) notFound();
  const locale = localeOf(tag);
  const job = query("job");
  const sql = db();
  const jobs = await sql<{ id: string; title: string }[]>`select id, title from jobs where state != 'draft' order by (state = 'open') desc, coalesce(opened_at, created_at) desc limit 100`;
  const r = await report(sql, member, job);
  const w = t.reports;
  const current = jobs.find(j => String(j.id) === job);
  const max = (list: { count?: number; reached?: number }[]) => Math.max(1, ...list.map(x => x.count ?? x.reached ?? 0));
  return {
    title: current ? format(w.titleJob, { job: current.title }) : w.title,
    body: (
      <div className="reports">
        <PageHeader title={current ? format(w.titleJob, { job: current.title }) : w.title} />
        <nav className="report-jobs" aria-label={w.pick}>
          <a href="/chest/reports" aria-current={!current ? "page" : undefined}>{w.all}</a>
          {jobs.map(j => <a key={j.id} href={`/chest/reports?job=${j.id}`} aria-current={current?.id === j.id ? "page" : undefined}>{j.title}</a>)}
        </nav>
        <div className="report-tiles">
          <Tile n={r.total} label={plural(w.applications, r.total, locale)} />
          <Tile n={r.active} label={w.inProgress} />
          <Tile n={r.hired} label={plural(w.hired, r.hired, locale)} />
          <Tile n={r.daysToHire} label={r.daysToHire === null ? w.noHire : plural(w.daysToHire, r.daysToHire, locale)} />
        </div>
        <div className="report-grid">
          <Bars title={w.perMonth} rows={r.months.map(m => ({ label: dayLabel(m.month + "-15", locale, { month: "short", year: "2-digit" }), value: m.count }))} max={max(r.months)} />
          <Bars title={w.sources} rows={r.sources.map(s => ({ label: t.candidate.source[s.source as keyof Catalogue["candidate"]["source"]] ?? s.source, value: s.count }))} max={max(r.sources)} empty={w.nothing} />
          {current && <Bars title={w.funnel} hint={w.funnelHint} rows={r.funnel.map(x => ({ label: stageLabel(x, t.jobSettings.defaults), value: x.reached }))} max={max(r.funnel)} />}
          <Bars title={w.reasons} rows={r.reasons.map(x => ({ label: t.reject.reasons[x.reason], value: x.count }))} max={max(r.reasons)} empty={w.nothing} />
        </div>
      </div>
    ),
  };
}

function Tile({ n, label }: { n: number | null; label: string }) {
  return <div className="tile"><span className="tile-n">{n ?? "–"}</span><span className="tile-label">{label}</span></div>;
}

function Bars({ title, hint, rows, max, empty }: { title: string; hint?: string; rows: { label: string; value: number }[]; max: number; empty?: string }) {
  return (
    <section className="panel" aria-label={title}>
      <h2>{title}</h2>
      {hint && <p className="hint tight-top">{hint}</p>}
      {rows.length === 0 ? <p className="muted">{empty}</p> : (
        <dl className="bars">
          {rows.map((row, i) => (
            <div key={i}>
              <dt>{row.label}</dt>
              <dd>
                <svg className="bar" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true" focusable="false"><rect width={Math.round((row.value / max) * 100)} height="10" /></svg>
                <span className="bar-n">{row.value}</span>
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

// Emails to the jobs mailbox no candidate claimed (a new address, a CV
// forwarded by a friend): a recruiter files each with a candidate, or
// deletes it. Plain forms: the page refreshes after each. The candidates
// offered: those who wrote from that address, then the latest hundred.
export async function mailPage({ member, t, locale: tag, f }: PageContext<MemberContext>): Promise<View> {
  if (!can(member, "candidates.manage")) notFound();
  const locale = localeOf(tag);
  const sql = db();
  const list = await unmatched(sql, member);
  const recent = await sql<{ id: string; name: string; email: string; title: string }[]>`
    select c.id, c.name, c.email, j.title from candidates c join jobs j on j.id = c.job_id order by c.created_at desc limit 100`;
  const addresses = [...new Set(list.map(m => (m.fromAddress ?? "").toLowerCase()).filter(Boolean))];
  const same = addresses.length === 0 ? [] : await sql<{ id: string; name: string; email: string; title: string }[]>`
    select c.id, c.name, c.email, j.title from candidates c join jobs j on j.id = c.job_id where lower(c.email) in ${sql(addresses)} order by c.created_at desc limit 200`;
  const w = t.mailbox;
  const label = (c: { name: string; title: string }) => `${c.name} · ${c.title}`;
  return {
    title: w.title,
    body: (
      <div className="narrow">
        <PageHeader title={w.title} intro={w.intro} />
        {list.length === 0 ? <EmptyState title={w.emptyTitle} body={w.emptyBody} /> : (
          <ul className="to-file">
            {list.map(m => {
              const address = (m.fromAddress ?? "").toLowerCase();
              const theirs = same.filter(c => c.email.toLowerCase() === address);
              const others = recent.filter(c => c.email.toLowerCase() !== address);
              return (
                <li key={m.id} id={`tofile-${m.id}`} className="panel">
                  <div className="panel-head"><strong>{m.subject || t.write.noSubject}</strong><span className="muted small">{formatDate(m.createdAt, locale, f.timeZone, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span></div>
                  <p className="muted small">{m.fromName ? `${m.fromName} <${m.fromAddress ?? ""}>` : m.fromAddress ?? ""}</p>
                  <p className="pre mail-body">{m.body}</p>
                  {(m.attachments.length > 0 || m.hasOriginal) && (
                    <ul className="mail-files">
                      {m.attachments.map((a, i) => <li key={i}><a href={`/chest/messages/${m.id}/files/${i}`} download><Download />{a.name}</a></li>)}
                      {m.hasOriginal && <li><a href={`/chest/messages/${m.id}/files/original`} download><Download />{t.write.original}</a></li>}
                    </ul>
                  )}
                  <div className="inline-form">
                    <form className="inline-form" method="post" action="/chest/actions/fileMessage">
                      <input type="hidden" name="message" value={m.id} />
                      <label className="visually-hidden" htmlFor={`file-${m.id}`}>{w.fileWith}</label>
                      <select id={`file-${m.id}`} name="candidate" className="field" required defaultValue={theirs[0]?.id ?? ""}>
                        <option value="">{w.fileWith}…</option>
                        {theirs.length > 0 && <optgroup label={w.sameAddress}>{theirs.map(c => <option key={c.id} value={c.id}>{label(c)}</option>)}</optgroup>}
                        <optgroup label={w.everyone}>{others.map(c => <option key={c.id} value={c.id}>{label(c)}</option>)}</optgroup>
                      </select>
                      <button type="submit" className="button small">{w.file}</button>
                    </form>
                    <form method="post" action="/chest/actions/removeMessage">
                      <input type="hidden" name="message" value={m.id} />
                      <button type="submit" className="button link small"><Bin />{w.remove}</button>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    ),
  };
}

