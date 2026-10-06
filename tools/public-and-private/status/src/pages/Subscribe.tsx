import type { View } from "@argentic/chest-app";
import { Back, Chat, Mail, Rss } from "../components/icons.tsx";
import { format } from "../i18n/index.ts";
import { errorCodes, type ErrorCode } from "../lib/app-error.ts";
import { formToken } from "../lib/guard.ts";
import { followOptions } from "../lib/options.ts";
import type { PublicContext } from "../lib/public-page.ts";
import { ChoiceFields } from "./parts/choice-fields.tsx";
import { siteTitle, unindexed } from "./parts/meta.tsx";
import { PublicShell } from "./parts/public-shell.tsx";

// A refusal a public action put in the address (?error=…), if it is one
// of the tool's codes.
export const refusal = (value: string | undefined): ErrorCode | null => ((errorCodes as readonly string[]).includes(value ?? "") ? (value as ErrorCode) : null);

// Get updates by email: an address, what to follow, one button. The email
// that confirms it follows; without email on this Chest, the page gives the
// feeds instead. The form works without JavaScript (src/actions.ts,
// subscribe).
export async function subscribePage(context: PublicContext, origin: string, query: { sent: string | undefined; error: string | undefined }): Promise<View> {
  const { t, locale, sql, offerMail, offerChat } = context;
  const error = refusal(query.error);
  const w = t.subscribe;
  const noMail = !offerMail || error === "no_mail";
  // Slack, Teams or a web address, beside email — only when the Chest would
  // deliver them now (webhooks.available()).
  const chat = offerChat ? <p className="links"><a href="/subscribe/chat"><Chat />{t.hooks.chatLink}</a></p> : null;
  return { title: siteTitle(context, w.title), exactTitle: true, head: unindexed, body: (
    <PublicShell context={context} path="/subscribe" offerMail={false}>
      <p className="crumb"><a href="/"><Back />{w.backToStatus}</a></p>
      {query.sent === "1" && !error ? (
        <section className="card narrow done">
          <Mail />
          <h1>{w.sentTitle}</h1>
          <p>{w.sentBody}</p>
        </section>
      ) : noMail ? (
        <section className="card narrow">
          <h1>{w.noMailTitle}</h1>
          <p>{w.noMailBody}</p>
          <p className="label">{w.feedHelp}</p>
          <p><code className="copy">{origin}/feed.rss</code></p>
          <p className="links"><a href="/feed.rss"><Rss />{t.public.rss}</a><a href="/feed.atom"><Rss />{t.public.atom}</a></p>
          {chat}
        </section>
      ) : (
        <section className="card narrow">
          <h1>{w.title}</h1>
          <p className="lead">{w.intro}</p>
          <form method="post" action="/actions/subscribe" className="stack form">
            <input type="hidden" name="started" value={formToken()} />
            <div className="honey" aria-hidden="true">
              <label htmlFor="website">{w.website}</label>
              <input id="website" name="website" tabIndex={-1} autoComplete="off" />
            </div>
            <div>
              <label className="label" htmlFor="email">{w.email}</label>
              <input id="email" name="email" type="email" className="field" autoComplete="email" required maxLength={254} aria-invalid={error === "invalid_email" || undefined} aria-describedby={error ? "form-error" : undefined} />
            </div>
            <ChoiceFields options={await followOptions(sql, locale)} chosen={null} t={w} />
            {error && <p id="form-error" className="error" role="alert">{format(t.errors[error], { max: 5 })}</p>}
            <div><button type="submit" className="button">{w.submit}</button></div>
            <p className="fine">{w.privacy}</p>
          </form>
          {chat}
        </section>
      )}
    </PublicShell>
  ) };
}
