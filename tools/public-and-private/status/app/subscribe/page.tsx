import type { Metadata } from "next";
import { ChoiceFields } from "../../components/choice-fields.tsx";
import { Back, Chat, Mail, Rss } from "../../components/icons.tsx";
import { PublicShell } from "../../components/public-shell.tsx";
import { errorCodes, type ErrorCode } from "../../lib/app-error.ts";
import { formToken } from "../../lib/guard.ts";
import { hooksState } from "../../lib/hooks.ts";
import { format } from "../../lib/i18n/index.ts";
import { followOptions } from "../../lib/options.ts";
import { publicContext } from "../../lib/public-page.ts";
import { publicOrigin } from "../../lib/public-origin.ts";
import { headers } from "next/headers";
import { subscribeAction } from "../public-actions.ts";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await publicContext();
  return { title: t.subscribe.title, robots: { index: false, follow: false } };
}

// Get updates by email: an address, what to follow, one button. The email
// that confirms it follows; without email on this Chest, the page gives the
// feeds instead.
export default async function SubscribePage({ searchParams }: { searchParams: Promise<{ sent?: string; error?: string }> }) {
  const query = await searchParams;
  const { t, locale, sql, zone, company, offerMail } = await publicContext();
  const error = (errorCodes as readonly string[]).includes(query.error ?? "") ? (query.error as ErrorCode) : null;
  const origin = publicOrigin(await headers()) ?? "";
  const w = t.subscribe;
  const noMail = !offerMail || error === "no_mail";
  // Slack, Teams or a web address, beside email — unless the Chest said it
  // cannot deliver them.
  const chat = (await hooksState(sql)) !== "none" ? <p className="links"><a href="/subscribe/chat"><Chat />{t.hooks.chatLink}</a></p> : null;
  return (
    <PublicShell company={company} locale={locale} zone={zone} t={t} path="/subscribe" offerMail={false}>
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
          <form action={subscribeAction} className="stack form">
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
  );
}
