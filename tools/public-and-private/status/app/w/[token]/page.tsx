import type { Metadata } from "next";
import { ChoiceFields } from "../../../components/choice-fields.tsx";
import { Back } from "../../../components/icons.tsx";
import { PublicShell } from "../../../components/public-shell.tsx";
import { errorCodes, type ErrorCode } from "../../../lib/app-error.ts";
import { hookByToken, takeSecret } from "../../../lib/hooks.ts";
import { format } from "../../../lib/i18n/index.ts";
import { followOptions } from "../../../lib/options.ts";
import { publicContext } from "../../../lib/public-page.ts";
import { chooseHookAction, retryHookAction, stopHookAction } from "../../public-actions.ts";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await publicContext();
  return { title: t.hooks.title, robots: { index: false, follow: false }, referrer: "no-referrer" };
}

// A chat subscription's own page (its address is the key, shown once,
// like a password): where the updates go, whether the Chest delivers
// ("Try again" once it stopped), what is followed, "Stop the updates".
// Right after connecting a web address, its secret key — once.
export default async function HookPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ done?: string; error?: string; new?: string }> }) {
  const { token } = await params;
  const query = await searchParams;
  const { t, locale, sql, zone, company } = await publicContext();
  const w = t.hooks;
  const h = await hookByToken(sql, token);
  const secret = h && query.new === "1" ? await takeSecret(sql, token) : null;
  const error = (errorCodes as readonly string[]).includes(query.error ?? "") ? (query.error as ErrorCode) : null;
  return (
    <PublicShell company={company} locale={locale} zone={zone} t={t} path="/" offerMail={false}>
      <p className="crumb"><a href="/"><Back />{t.subscribe.backToStatus}</a></p>
      {!h ? (
        <section className="card narrow">
          <h1>{query.done === "gone" ? w.goneTitle : t.subscriber.badTitle}</h1>
          <p>{query.done === "gone" ? w.goneBody : t.subscriber.badBody}</p>
        </section>
      ) : (
        <section className="card narrow stack">
          <h1>{w.connectedTitle}</h1>
          {query.done === "saved" && <p className="notice" role="status">{t.subscriber.saved}</p>}
          {query.done === "retried" && <p className="notice" role="status">{w.retried}</p>}
          {error && <p className="error" role="alert">{format(t.errors[error], { max: 60 })}</p>}
          <p>{w.connectedBody}</p>
          <p><code className="copy">{h.shown}</code></p>
          {query.new === "1" && <p className="fine">{w.keepLink}</p>}
          {secret && (
            <div className="secret stack">
              <p className="label">{w.secretTitle}</p>
              <p><code className="copy">{secret}</code></p>
              <p className="fine">{w.secretBody}</p>
            </div>
          )}
          {h.disabledAt && (
            <form action={retryHookAction} className="alert">
              <input type="hidden" name="token" value={h.token} />
              <p><strong>{format(w.stopped, { reason: h.lastError ?? "—" })}</strong></p>
              <div><button type="submit" className="button quiet">{w.retry}</button></div>
            </form>
          )}
          <form action={chooseHookAction} className="stack">
            <input type="hidden" name="token" value={h.token} />
            <ChoiceFields options={await followOptions(sql, locale)} chosen={h.components} t={t.subscribe} />
            <div><button type="submit" className="button">{t.subscriber.save}</button></div>
          </form>
          <form action={stopHookAction} className="unsubscribe">
            <input type="hidden" name="token" value={h.token} />
            <button type="submit" className="button quiet">{w.stop}</button>
            <p className="fine">{w.stopHint}</p>
          </form>
        </section>
      )}
    </PublicShell>
  );
}
