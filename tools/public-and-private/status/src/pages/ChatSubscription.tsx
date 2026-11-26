import type { View } from "@argentic/chest-app";
import { Back } from "../components/icons.tsx";
import { format } from "../i18n/index.ts";
import { hookByToken, takeSecret } from "../lib/hooks.ts";
import { followOptions } from "../lib/options.ts";
import type { PublicContext } from "../lib/public-page.ts";
import { ChoiceFields } from "./parts/choice-fields.tsx";
import { siteTitle, unindexed } from "./parts/meta.tsx";
import { PublicShell } from "./parts/public-shell.tsx";
import { refusal } from "./Subscribe.tsx";

// A chat subscription's own page (its address is the key, shown once,
// like a password): where the updates go, whether the Chest delivers
// ("Try again" once it stopped), what is followed, "Stop the updates".
// Right after connecting a web address, its secret key — once.
export async function chatSubscriptionPage(context: PublicContext, token: string, query: { done: string | undefined; error: string | undefined; new: string | undefined }): Promise<View> {
  const { t, locale, sql } = context;
  const w = t.hooks;
  const h = await hookByToken(sql, token);
  const secret = h && query.new === "1" ? await takeSecret(sql, token) : null;
  const error = refusal(query.error);
  return { title: siteTitle(context, w.title), exactTitle: true, head: unindexed, body: (
    <PublicShell context={context} path="/" offerMail={false}>
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
            <form method="post" action="/actions/retryChat" className="alert">
              <input type="hidden" name="token" value={h.token} />
              <p><strong>{format(w.stopped, { reason: h.lastError ?? "—" })}</strong></p>
              <div><button type="submit" className="button quiet">{w.retry}</button></div>
            </form>
          )}
          <form method="post" action="/actions/chooseChatFollowed" className="stack">
            <input type="hidden" name="token" value={h.token} />
            <ChoiceFields options={await followOptions(sql, locale)} chosen={h.components} t={t.subscribe} />
            <div><button type="submit" className="button">{t.subscriber.save}</button></div>
          </form>
          <form method="post" action="/actions/stopChat" className="unsubscribe">
            <input type="hidden" name="token" value={h.token} />
            <button type="submit" className="button quiet">{w.stop}</button>
            <p className="fine">{w.stopHint}</p>
          </form>
        </section>
      )}
    </PublicShell>
  ) };
}
