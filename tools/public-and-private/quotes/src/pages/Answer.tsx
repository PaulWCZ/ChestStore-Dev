import { Island, type PageContext, type View, type VisitorContext } from "@argentic/chest-app";
import { chest } from "@argentic/chest-sdk/chest";
import type { ReactNode } from "react";
import { Alert, Check, Close, Download } from "../components/icons.tsx";
import { QuoteSheet } from "../components/quote-sheet.tsx";
import { catalogue, format, formatDate, formatDay, localeOf, type Catalogue, type Locale } from "../i18n/index.ts";
import type { Full } from "../lib/documents.ts";
import { company, goesBy } from "../lib/company.ts";
import { db } from "../lib/db.ts";
import { formatMoney } from "../lib/money.ts";
import { versioned } from "../lib/model.ts";
import { openLink, shownFingerprint } from "../lib/online.ts";
import { changesSince, earlierVersions } from "../lib/versions.ts";

// The client's page of a quote (/q/<secret>): the quote as a page and as
// its PDF, and the answer — accept ("Bon pour accord") or decline. The
// secret is the only key; a link that does not work says so and shows
// nothing of the quote. Nothing here asks the Chest per request: the
// look is kept a minute (chest.theme), the PDF's fingerprint is the
// link's row (src/lib/online.ts) — the PDF is drawn and kept once per
// version, by the first visitor.
export async function answerPage(ctx: PageContext<VisitorContext>): Promise<View> {
  const { t } = ctx;
  const locale = localeOf(ctx.locale);
  const secret = ctx.param("secret");
  const sql = db();
  const today = chest.today();
  const self = `/q/${secret}`;
  const opened = await openLink(sql, secret, today);
  const companyName = opened?.full.seller ? opened.full.seller.tradeName || opened.full.seller.legalName : goesBy(await company(sql));
  const o = t.online;
  // No search engine, and no referrer to another site (the address holds
  // the secret).
  const head = <><meta name="robots" content="noindex, nofollow" /><meta name="referrer" content="same-origin" /></>;
  const view = (title: string, body: ReactNode): View => ({ title, body, head, layout: { company: companyName } });
  const notice = (title: string, body: string, more?: ReactNode) => view(title, (
    <div className="answer-state off">
      <div className="seal-mark" aria-hidden="true"><Alert /></div>
      <h1>{title}</h1>
      <p className="lead">{body}</p>
      {more}
    </div>
  ));
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
  // The PDF of this version, kept: its fingerprint goes with the answer.
  const shown = showing === "open" ? await shownFingerprint(sql, opened, today).catch(() => null) : null;
  // The answer was refused because the quote changed while it was read
  // (?read=<the fingerprint read>): what is different.
  const read = ctx.query("read");
  const changes = showing === "open" && read && /^[0-9a-f]{64}$/u.test(read) ? (read !== shown ? await whatChanged(sql, full, read, t, locale) : []) : null;
  const number = versioned(full.number, full.version) ?? "";
  const previous = earlier[0];
  const replaces = previous
    ? previous.issueDate ? format(o.replaces, { version: full.version, previous: previous.version, date: longDay(previous.issueDate) }) : format(o.replacesNoDate, { version: full.version, previous: previous.version })
    : null;
  const pdf = `${self}/pdf`;
  const lead = showing === "open" ? format(o.openLead, { company: companyName, amount: money(full.gross), date: longDay(full.validUntil ?? today) })
    : showing === "expired" ? format(o.expiredLead, { company: companyName, date: longDay(full.validUntil ?? today) })
    : answer ? format(answer.answer === "accepted" ? o.acceptedBy : o.refusedBy, { name: answer.name, date: formatDate(answer.answeredAt, locale, { timeZone: chest.timeZone, day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }) })
    : format(showing === "accepted" ? o.acceptedByCompany : o.refusedByCompany, { company: companyName });
  const title = showing === "open" ? format(o.openTitle, { number })
    : showing === "expired" ? format(o.expiredTitle, { number })
    : format(showing === "accepted" ? o.acceptedTitle : o.refusedTitle, { number });
  const terms = (await company(sql)).terms;
  return view(title, (
    <>
      <div className={`answer-state ${showing}`}>
        {showing === "accepted" && <div className="seal-mark ok" aria-hidden="true"><Check /></div>}
        {showing === "refused" && <div className="seal-mark" aria-hidden="true"><Close /></div>}
        <h1>{title}</h1>
        <p className="lead" role={ctx.query("answered") === "1" ? "status" : undefined}>{lead}</p>
        {showing === "accepted" && answer && <p className="hint">{format(o.acceptedNext, { company: companyName })}</p>}
        {replaces && <p className="replaces">{replaces}</p>}
        {earlierList}
        <p className="row centre">
          <a className="button quiet" href={pdf} target="_blank" rel="noopener"><Download />{showing === "accepted" && answer ? o.pdfAccepted : o.pdfOpen}</a>
          {terms && <a className="button quiet" href={`${self}/terms`} target="_blank" rel="noopener"><Download />{o.termsLink}</a>}
          {showing === "open" && <a className="link-button" href="#answer">{o.toAnswer}</a>}
        </p>
      </div>
      <QuoteSheet full={{ ...full, number: number || null }} words={catalogue(full.language).pdf} language={full.language} />
      {showing === "open" && (
        <section className="card answer" id="answer" aria-label={o.answerLabel}>
          {shown ? (
            <Island name="AnswerForm" props={{
              secret, shown, terms: terms?.sha256 ?? "", today: longDay(today), amount: money(full.gross), changes,
              t: { acceptTitle: o.acceptTitle, acceptLead: o.acceptLead, name: o.name, goodForAgreement: o.goodForAgreement, agreeHint: o.agreeHint, agreeHintTerms: o.agreeHintTerms, date: o.date, accept: o.accept, declineLink: o.declineLink, declineTitle: o.declineTitle, reason: o.reason, optional: o.optional, decline: o.decline, cancel: o.cancel, changedTitle: o.changedTitle, changedLead: o.changedLead, changedPlain: o.changedPlain },
            }} />
          ) : <p className="error" role="alert"><Alert />{t.errors.unavailable}</p>}
        </section>
      )}
      <footer className="public-foot"><p className="fine">{o.notSignature}</p></footer>
    </>
  ));
}

// The differences between the version the client read (the PDF's
// fingerprint their form carried) and the quote now, as sentences in the
// visitor's language, amounts in the quote's currency ([] when the version
// read is not known: the page only says the quote changed).
async function whatChanged(sql: ReturnType<typeof db>, full: Pick<Full, "id" | "lines" | "gross" | "currency">, read: string, t: Catalogue, locale: Locale): Promise<string[]> {
  const found = await changesSince(sql, full, read);
  if (!found) return [];
  const o = t.online;
  const money = (minor: number) => formatMoney(minor, full.currency, locale);
  return found.changes.map(c => c.kind === "total" ? format(o.changeTotal, { before: money(c.before), after: money(c.after) })
    : c.kind === "changed" ? format(o.changeLine, { description: c.description, before: money(c.before), after: money(c.after) })
    : format(c.kind === "added" ? o.changeAdded : o.changeRemoved, { description: c.description, amount: money(c.amount) }));
}
