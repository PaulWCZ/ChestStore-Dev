import { chest } from "@argentic/chest-sdk/chest";
import { ChestError } from "@argentic/chest-sdk/errors";
import * as visitors from "@argentic/chest-sdk/visitors";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Check, Close, Download, Alert } from "../../../components/icons.tsx";
import { PublicShell } from "../../../components/public-shell.tsx";
import { QuoteSheet } from "../../../components/quote-sheet.tsx";
import { company, goesBy } from "../../../lib/company.ts";
import { db } from "../../../lib/db.ts";
import { catalogue, format, formatDate, formatDay } from "../../../lib/i18n/index.ts";
import { formatMoney } from "../../../lib/money.ts";
import { versioned } from "../../../lib/model.ts";
import { openLink, shownPdf } from "../../../lib/online.ts";
import { earlierVersions } from "../../../lib/versions.ts";
import { publicWords } from "../../../lib/session.ts";
import { AnswerForm } from "./answer-form.tsx";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await publicWords();
  return { title: t.online.pageTitle, robots: { index: false, follow: false }, referrer: "same-origin" };
}

// The client's page of a quote (/q/<secret>): the quote as a page and as
// its PDF, and the answer — accept ("Bon pour accord") or decline. The
// secret is the only key; a link that does not work says so and shows
// nothing of the quote.
export default async function QuoteLinkPage({ params, searchParams }: { params: Promise<{ secret: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { secret } = await params;
  const q = await searchParams;
  const { t, locale } = await publicWords();
  const sql = db();
  const today = chest.today();
  const self = `/q/${secret}`;
  const opened = await openLink(sql, secret, today);
  const c = await company(sql);
  const companyName = opened?.full.seller ? opened.full.seller.tradeName || opened.full.seller.legalName : goesBy(c);
  const o = t.online;
  const notice = (title: string, body: string, more?: ReactNode) => (
    <PublicShell company={companyName} locale={locale} label={t.public.language} back={self}>
      <div className="answer-state off">
        <div className="seal-mark" aria-hidden="true"><Alert /></div>
        <h1>{title}</h1>
        <p className="lead">{body}</p>
        {more}
      </div>
    </PublicShell>
  );
  if (!opened) return notice(o.notFoundTitle, o.notFoundBody);
  const { full, showing, answer } = opened;
  if (showing === "off") return notice(o.offTitle, format(o.offBody, { company: companyName }));
  // The quote's earlier versions stay readable by whoever holds its link.
  const earlier = full.version > 1 ? await earlierVersions(sql, full.id) : [];
  const earlierList = earlier.some(v => v.hasPdf) ? (
    <ul className="earlier" aria-label={o.earlierTitle}>
      {earlier.filter(v => v.hasPdf).map(v => <li key={v.version}><a href={`${self}/pdf?version=${v.version}`} target="_blank" rel="noopener"><Download />{format(o.earlierPdf, { version: v.version })}</a></li>)}
    </ul>
  ) : null;
  if (showing === "revising") return notice(format(o.revisingTitle, { number: full.number ?? "" }), format(o.revisingBody, { company: companyName }), earlierList);

  const money = (minor: number) => formatMoney(minor, full.currency, locale);
  const longDay = (d: string) => formatDay(d, locale, { day: "numeric", month: "long", year: "numeric" });
  const zone = chest.timeZone;
  // The PDF of this version, kept: its fingerprint goes with the answer.
  let shown: string | null = null;
  try {
    shown = (await shownPdf(sql, opened, today)).sha256;
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
  }
  const number = versioned(full.number, full.version) ?? "";
  const previous = earlier[0];
  const replaces = previous
    ? previous.issueDate ? format(o.replaces, { version: full.version, previous: previous.version, date: longDay(previous.issueDate) }) : format(o.replacesNoDate, { version: full.version, previous: previous.version })
    : null;
  const pdf = `${self}/pdf`;
  const lead = showing === "open" ? format(o.openLead, { company: companyName, amount: money(full.gross), date: longDay(full.validUntil ?? today) })
    : showing === "expired" ? format(o.expiredLead, { company: companyName, date: longDay(full.validUntil ?? today) })
    : answer ? format(answer.answer === "accepted" ? o.acceptedBy : o.refusedBy, { name: answer.name, date: formatDate(answer.answeredAt, locale, { timeZone: zone, day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }) })
    : format(showing === "accepted" ? o.acceptedByCompany : o.refusedByCompany, { company: companyName });
  const title = showing === "open" ? format(o.openTitle, { number })
    : showing === "expired" ? format(o.expiredTitle, { number })
    : format(showing === "accepted" ? o.acceptedTitle : o.refusedTitle, { number });
  const pdfWords = catalogue(full.language).pdf;

  return (
    <PublicShell company={companyName} locale={locale} label={t.public.language} back={self}
      foot={<p className="fine">{o.notSignature}</p>}>
      <div className={`answer-state ${showing}`}>
        {showing === "accepted" && <div className="seal-mark ok" aria-hidden="true"><Check /></div>}
        {showing === "refused" && <div className="seal-mark" aria-hidden="true"><Close /></div>}
        <h1>{title}</h1>
        <p className="lead" role={q["answered"] === "1" ? "status" : undefined}>{lead}</p>
        {showing === "accepted" && answer && <p className="hint">{format(o.acceptedNext, { company: companyName })}</p>}
        {replaces && <p className="replaces">{replaces}</p>}
        {earlierList}
        <p className="row centre">
          <a className="button quiet" href={pdf} target="_blank" rel="noopener"><Download />{showing === "accepted" && answer ? o.pdfAccepted : o.pdfOpen}</a>
          {c.terms && <a className="button quiet" href={`${self}/terms`} target="_blank" rel="noopener"><Download />{o.termsLink}</a>}
          {showing === "open" && <a className="link-button" href="#answer">{o.toAnswer}</a>}
        </p>
      </div>
      <QuoteSheet full={{ ...full, number: number || null }} words={pdfWords} language={full.language} />
      {showing === "open" && (
        <section className="card answer" id="answer" aria-label={o.answerLabel}>
          {shown ? (
            <AnswerForm secret={secret} shown={shown} terms={c.terms?.sha256 ?? ""} started={visitors.formToken()} today={longDay(today)} amount={money(full.gross)}
              t={{ ...o, errors: t.errors }} />
          ) : <p className="error" role="alert"><Alert />{t.errors.unavailable}</p>}
        </section>
      )}
    </PublicShell>
  );
}
