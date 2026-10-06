import { Island, notFound, type PageContext, type View, type VisitorContext } from "@argentic/chest-app";
import { Body } from "../components/body.tsx";
import { StateBadge } from "../components/badges.tsx";
import { Clip } from "../components/icons.tsx";
import { fileSize, format, formatDate, isLocale, localeOf, words } from "../i18n/index.ts";
import { db } from "../lib/db.ts";
import { people } from "../lib/people.ts";
import { publicUploadsOn } from "../lib/attachments.ts";
import { byLink, settings } from "../lib/tickets.ts";
import { publicLook } from "../theme.ts";
import { PublicShell } from "./public-shell.tsx";

// A customer's request, as they see it with their link, /t/<secret>: our
// answers (never the team's notes), its state, and a box to write again;
// once closed, "Did we solve your problem?". It speaks the request's
// language (the customer wrote in it), unless the visitor switches
// (?lang=). Its address is the key: never indexed, never logged (the
// package logs the route's pattern), never sent as a referrer.
export async function followUpPage({ locale: visitor, query, f }: PageContext<VisitorContext>, secret: string): Promise<View> {
  const sql = db();
  const found = await byLink(sql, secret);
  // An unknown link is no page: 404, in the public frame, with the way to
  // write a new request (src/layout.tsx).
  if (!found) notFound();
  const ticket = found!;
  const given = query("lang");
  const locale = isLocale(given) ? given : isLocale(ticket.language) ? ticket.language : localeOf(visitor);
  const t = words(locale);
  const [s, look, filesOn] = await Promise.all([settings(sql), publicLook(), publicUploadsOn()]);
  const company = s.companyName || t.public.teamPlain;
  const embed = query("embed") === "1";
  const logo = look.source === "brand" ? look.logo ?? null : null;
  const back = `/t/${secret}${embed ? "?embed=1" : ""}`;
  const who = await people(ticket.messages.filter(m => m.kind === "reply" && m.author).map(m => m.author!));
  const teamWord = s.companyName ? format(t.public.team, { company: s.companyName }) : t.public.teamPlain;
  const teamName = (author: string | null) => {
    const person = author ? who.get(author) : undefined;
    const first = person?.status === "member" ? person.name.split(" ")[0] : undefined;
    return first ? `${first} · ${teamWord}` : teamWord;
  };
  const title = format(t.public.followTitle, { number: ticket.number });
  return {
    title,
    locale,
    body: (
      <PublicShell company={company} logo={logo} locale={locale} back={back} t={t} embed={embed}>
        {query("new") && (
          <section className="success" aria-labelledby="thanks">
            <h2 id="thanks">{t.public.thanksTitle}</h2>
            <p>{format(t.public.thanksNumber, { number: ticket.number })}</p>
            {query("again") && <p className="muted">{t.public.alreadyHad}</p>}
            <p>{t.public.keepLink}</p>
            {query("mailed") && <p className="muted">{format(t.public.emailed, { email: ticket.customerEmail })}</p>}
            <Island name="CopyLink" props={{ label: t.public.copy, done: t.public.copied }} />
          </section>
        )}
        <div className="stack">
          <h1>{title}</h1>
          <p className="muted subject-line">{ticket.subject}</p>
          <p className="status-line"><span className="muted">{t.public.status}</span><StateBadge status={ticket.status} label={t.public.statuses[ticket.status]} /></p>
        </div>
        <ol className="thread" aria-label={title}>
          {ticket.messages.map(m => (
            <li key={m.id} id={`m${m.id}`} className={bubble(m.kind)}>
              <span className="avatar" aria-hidden="true">{m.kind === "customer" ? initials(ticket.customerName || ticket.customerEmail) : company.slice(0, 1).toUpperCase()}</span>
              <div className="bubble">
                <div className="who">{m.kind === "customer" ? t.public.you : teamName(m.author)} <time dateTime={m.at}>{formatDate(m.at, locale, f.timeZone, { dateStyle: "medium", timeStyle: "short" })}</time></div>
                <Body text={m.body} />
                {m.attachments.length > 0 && (
                  <div className="files" aria-label={t.kit.files.list}>
                    {m.attachments.map(a => <a key={a.id} href={`/t/${secret}/files/${a.id}`} rel="noreferrer"><Clip />{a.fileName}<span className="size">{fileSize(a.size, locale)}</span></a>)}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
        {ticket.status === "closed" && <Island name="Rate" props={{ secret, rating: ticket.rating, t: { rateTitle: t.public.rateTitle, rateGood: t.public.rateGood, rateBad: t.public.rateBad, rated: t.public.rated } }} />}
        <section className="public-card" aria-labelledby="again">
          <h2 id="again">{t.public.reply}</h2>
          {ticket.status === "closed" && <p className="hint">{t.public.reopenHint}</p>}
          <Island name="WriteAgain" props={{ secret, filesOn, t: { public: t.public, errors: t.errors, files: t.kit.files } }} />
        </section>
      </PublicShell>
    ),
  };
}

// The customer's own mark: the initials of their name (or of their address).
function initials(name: string): string {
  const parts = name.split(/[\s@._-]+/u).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[1]![0] ?? "" : "")).toUpperCase() || "?";
}

// The customer's words on the left; the team's answers on the right, in
// the team's tint.
const bubble = (kind: string) => (kind === "customer" ? "msg" : "msg team");
