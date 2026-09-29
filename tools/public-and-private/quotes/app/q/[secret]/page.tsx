import * as chest from "@argentic/chest-sdk/chest";
import { ChestError } from "@argentic/chest-sdk/errors";
import * as visitors from "@argentic/chest-sdk/visitors";
import type { Metadata } from "next";
import { Check, Close, Download, Alert } from "../../../components/icons.tsx";
import { PublicShell } from "../../../components/public-shell.tsx";
import { QuoteSheet } from "../../../components/quote-sheet.tsx";
import { company } from "../../../lib/company.ts";
import { db } from "../../../lib/db.ts";
import { catalogue, format, formatDate, formatDay } from "../../../lib/i18n/index.ts";
import { formatMoney } from "../../../lib/money.ts";
import { openLink, shownPdf } from "../../../lib/online.ts";
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
  const companyName = opened?.full.seller ? opened.full.seller.tradeName || opened.full.seller.legalName : c.tradeName || c.legalName;
  const o = t.online;
  const notice = (title: string, body: string) => (
    <PublicShell company={companyName} locale={locale} label={t.public.language} back={self}>
      <div className="answer-state off">
        <div className="seal-mark" aria-hidden="true"><Alert /></div>
        <h1>{title}</h1>
        <p className="lead">{body}</p>
      </div>
    </PublicShell>
  );
  if (!opened) return notice(o.notFoundTitle, o.notFoundBody);
  const { full, showing, answer } = opened;
  if (showing === "off") return notice(o.offTitle, format(o.offBody, { company: companyName }));

  const money = (minor: number) => formatMoney(minor, full.currency, locale);
  const longDay = (d: string) => formatDay(d, locale, { day: "numeric", month: "long", year: "numeric" });
  const zone = chest.timeZone();
  // The PDF of this version, kept: its fingerprint goes with the answer.
  let shown: string | null = null;
  try {
    shown = (await shownPdf(sql, opened, today)).sha256;
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
  }
  const number = full.number ?? "";
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
        {showing === "accepted" && answer && <p className="hint">{o.acceptedNext}</p>}
        <p className="row centre">
          <a className="button quiet" href={pdf} target="_blank" rel="noopener"><Download />{showing === "accepted" && answer ? o.pdfAccepted : o.pdfOpen}</a>
          {showing === "open" && <a className="link-button" href="#answer">{o.toAnswer}</a>}
        </p>
      </div>
      <QuoteSheet full={full} words={pdfWords} language={full.language} />
      {showing === "open" && (
        <section className="card answer" id="answer" aria-label={o.answerLabel}>
          {shown ? (
            <AnswerForm secret={secret} shown={shown} started={visitors.formToken()} today={longDay(today)} amount={money(full.gross)}
              t={{ ...o, errors: t.errors }} />
          ) : <p className="error" role="alert"><Alert />{t.errors.unavailable}</p>}
        </section>
      )}
    </PublicShell>
  );
}
