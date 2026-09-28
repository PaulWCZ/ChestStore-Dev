import type { Metadata } from "next";
import { PublicShell } from "../../../components/public-shell.tsx";
import { db } from "../../../lib/db.ts";
import { Clip } from "../../../components/icons.tsx";
import { fileSize, format, formatDate } from "../../../lib/i18n/index.ts";
import { people } from "../../../lib/people.ts";
import { publicWords } from "../../../lib/session.ts";
import { byLink, settings } from "../../../lib/tickets.ts";
import { CopyLink } from "./copy-link.tsx";
import { WriteAgain } from "./write-again.tsx";

// Never indexed, never sent as a referrer: the address is the key.
export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

// A customer's request, as they see it with their link: our answers (never
// the team's notes), its state, and a box to write again.
export default async function FollowUp({ params, searchParams }: { params: Promise<{ secret: string }>; searchParams: Promise<{ new?: string; mailed?: string }> }) {
  const { t, locale } = await publicWords();
  const { secret } = await params;
  const search = await searchParams;
  const sql = db();
  const s = await settings(sql);
  const company = s.companyName || t.public.teamPlain;
  const ticket = await byLink(sql, secret);
  const back = `/t/${secret}`;
  if (!ticket) {
    return (
      <PublicShell company={company} locale={locale} label={t.public.language} back="/">
        <div className="stack">
          <h1>{t.public.notFoundTitle}</h1>
          <p className="muted">{t.public.notFoundBody}</p>
          <div><a className="button" href="/">{t.public.newRequest}</a></div>
        </div>
      </PublicShell>
    );
  }
  const who = await people(ticket.messages.filter(m => m.kind === "reply" && m.author).map(m => m.author!));
  const teamName = (author: string | null) => {
    const first = author ? who.get(author)?.name.split(" ")[0] : undefined;
    return first && who.get(author!)?.status === "member" ? `${first} · ${s.companyName ? format(t.public.team, { company: s.companyName }) : t.public.teamPlain}` : s.companyName ? format(t.public.team, { company: s.companyName }) : t.public.teamPlain;
  };
  return (
    <PublicShell company={company} locale={locale} label={t.public.language} back={back}>
      {search.new && (
        <section className="success" aria-labelledby="thanks">
          <h2 id="thanks">{t.public.thanksTitle}</h2>
          <p>{format(t.public.thanksNumber, { number: ticket.number })}</p>
          <p>{t.public.keepLink}</p>
          {search.mailed && <p className="muted">{format(t.public.emailed, { email: ticket.customerEmail })}</p>}
          <CopyLink label={t.public.copy} done={t.public.copied} />
        </section>
      )}
      <div className="stack">
        <h1>{format(t.public.followTitle, { number: ticket.number })}</h1>
        <p className="muted" style={{ fontSize: "var(--text-l)" }}>{ticket.subject}</p>
        <p className="status-line"><span className="muted">{t.public.status}</span><span className={`chip ${ticket.status}`}>{t.public.statuses[ticket.status]}</span></p>
      </div>
      <ol className="thread" aria-label={t.public.followTitle.replace("{number}", String(ticket.number))}>
        {ticket.messages.map(m => (
          <li key={m.id} className={`msg ${m.kind === "customer" ? "" : "team"}`}>
            <span className="avatar" aria-hidden="true">{m.kind === "customer" ? "·" : company.slice(0, 1).toUpperCase()}</span>
            <div className="bubble">
              <div className="who">{m.kind === "customer" ? t.public.you : teamName(m.author)} <time dateTime={m.at}>{formatDate(m.at, locale, { dateStyle: "medium", timeStyle: "short" })}</time></div>
              <div className="body">{m.body}</div>
              {m.attachments.length > 0 && (
                <div className="files" aria-label={t.files.list}>
                  {m.attachments.map(a => <a key={a.id} href={`/t/${secret}/files/${a.id}`} rel="noreferrer"><Clip />{a.fileName}<span className="size">{fileSize(a.size, locale)}</span></a>)}
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
      <section className="public-card" aria-labelledby="again">
        <h2 id="again">{t.public.reply}</h2>
        {ticket.status === "closed" && <p className="hint">{t.public.reopenHint}</p>}
        <WriteAgain secret={secret} locale={locale} t={{ public: t.public, errors: t.errors, files: t.files }} />
      </section>
    </PublicShell>
  );
}
