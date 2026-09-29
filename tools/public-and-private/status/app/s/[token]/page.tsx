import type { Metadata } from "next";
import { ChoiceFields } from "../../../components/choice-fields.tsx";
import { Back } from "../../../components/icons.tsx";
import { PublicShell } from "../../../components/public-shell.tsx";
import { errorCodes, type ErrorCode } from "../../../lib/app-error.ts";
import { format } from "../../../lib/i18n/index.ts";
import { followOptions } from "../../../lib/options.ts";
import { publicContext } from "../../../lib/public-page.ts";
import { byToken } from "../../../lib/subscribers.ts";
import { chooseAction, confirmAction, unsubscribeAction } from "../../public-actions.ts";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await publicContext();
  return { title: t.subscribe.title, robots: { index: false, follow: false }, referrer: "no-referrer" };
}

// A subscriber's own page, opened from their emails: confirm (a button —
// a link opened by a mail scanner confirms nothing), choose what to follow,
// unsubscribe.
export default async function SubscriberPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ done?: string; error?: string }> }) {
  const { token } = await params;
  const query = await searchParams;
  const { t, locale, sql, zone, company } = await publicContext();
  const s = await byToken(sql, token);
  const w = t.subscriber;
  const error = (errorCodes as readonly string[]).includes(query.error ?? "") ? (query.error as ErrorCode) : null;
  return (
    <PublicShell company={company} locale={locale} zone={zone} t={t} path="/" offerMail={false}>
      <p className="crumb"><a href="/"><Back />{t.subscribe.backToStatus}</a></p>
      {!s ? (
        <section className="card narrow">
          <h1>{w.badTitle}</h1>
          <p>{w.badBody}</p>
        </section>
      ) : !s.confirmedAt ? (
        <section className="card narrow">
          <h1>{w.pendingTitle}</h1>
          <p>{format(w.pendingBody, { email: s.email })}</p>
          {error && <p className="error" role="alert">{t.errors[error]}</p>}
          <form action={confirmAction}>
            <input type="hidden" name="token" value={s.token} />
            <button type="submit" className="button">{w.confirm}</button>
          </form>
        </section>
      ) : (
        <section className="card narrow stack">
          <h1>{w.confirmedTitle}</h1>
          {query.done === "confirmed" && <p className="notice" role="status">{w.justConfirmed}</p>}
          {query.done === "saved" && <p className="notice" role="status">{w.saved}</p>}
          {error && <p className="error" role="alert">{format(t.errors[error], { max: 60 })}</p>}
          <p>{format(w.confirmedBody, { email: s.email })}</p>
          <form action={chooseAction} className="stack">
            <input type="hidden" name="token" value={s.token} />
            <ChoiceFields options={await followOptions(sql, locale)} chosen={s.components} t={t.subscribe} />
            <div><button type="submit" className="button">{w.save}</button></div>
          </form>
          <form action={unsubscribeAction} className="unsubscribe">
            <input type="hidden" name="token" value={s.token} />
            <button type="submit" className="button quiet">{w.unsubscribe}</button>
            <p className="fine">{w.unsubscribeHint}</p>
          </form>
        </section>
      )}
    </PublicShell>
  );
}
