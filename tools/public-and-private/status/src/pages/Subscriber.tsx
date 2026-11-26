import type { View } from "@argentic/chest-app";
import { Back } from "../components/icons.tsx";
import { format } from "../i18n/index.ts";
import { followOptions } from "../lib/options.ts";
import type { PublicContext } from "../lib/public-page.ts";
import { byToken } from "../lib/subscribers.ts";
import { ChoiceFields } from "./parts/choice-fields.tsx";
import { siteTitle, unindexed } from "./parts/meta.tsx";
import { PublicShell } from "./parts/public-shell.tsx";
import { refusal } from "./Subscribe.tsx";

// A subscriber's own page, opened from their emails: confirm (a button —
// a link opened by a mail scanner confirms nothing), choose what to follow,
// unsubscribe. Its address is its key: never kept by a cache, never passed
// on to another site (src/app.tsx).
export async function subscriberPage(context: PublicContext, token: string, query: { done: string | undefined; error: string | undefined }): Promise<View> {
  const { t, locale, sql } = context;
  const s = await byToken(sql, token);
  const w = t.subscriber;
  const error = refusal(query.error);
  return { title: siteTitle(context, t.subscribe.title), exactTitle: true, head: unindexed, body: (
    <PublicShell context={context} path="/" offerMail={false}>
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
          <form method="post" action="/actions/confirmSubscription">
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
          <form method="post" action="/actions/chooseFollowed" className="stack">
            <input type="hidden" name="token" value={s.token} />
            <ChoiceFields options={await followOptions(sql, locale)} chosen={s.components} t={t.subscribe} />
            <div><button type="submit" className="button">{w.save}</button></div>
          </form>
          <form method="post" action="/actions/unsubscribe" className="unsubscribe">
            <input type="hidden" name="token" value={s.token} />
            <button type="submit" className="button quiet">{w.unsubscribe}</button>
            <p className="fine">{w.unsubscribeHint}</p>
          </form>
        </section>
      )}
    </PublicShell>
  ) };
}
