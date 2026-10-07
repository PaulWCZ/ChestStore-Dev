import { Honeypot, type View } from "@argentic/chest-app";
import { Back, Chat, Mail, Rss } from "../components/icons.tsx";
import { format } from "../i18n/index.ts";
import { errorCodes, refusalAbout, type ErrorCode } from "../lib/app-error.ts";
import { followOptions } from "../lib/options.ts";
import type { PublicContext } from "../lib/public-page.ts";
import { ChoiceFields } from "./parts/choice-fields.tsx";
import { siteTitle, unindexed } from "./parts/meta.tsx";
import { PublicShell } from "./parts/public-shell.tsx";

// A refusal a public action put in the address (?error=<code>, one of the
// tool's codes), and the values it sent back (?values=…: the words' values
// and what the visitor typed).
export const refusal = (value: string | undefined): ErrorCode | null => ((errorCodes as readonly string[]).includes(value ?? "") ? (value as ErrorCode) : null);
export function sentBack(raw: string | undefined): Record<string, string> {
  try {
    const parsed = JSON.parse(raw ?? "{}") as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return Object.fromEntries(Object.entries(parsed).flatMap(([k, v]) => (/^\w{1,32}$/u.test(k) && (typeof v === "string" || typeof v === "number") && String(v).length < 100 ? [[k, String(v)]] : [])));
  } catch {
    return {};
  }
}

// Get updates by email: an address, what to follow, one button. The email
// that confirms it follows; without email on this Chest, the page gives the
// feeds instead. The form works without JavaScript (src/actions.ts,
// subscribe).
export async function subscribePage(context: PublicContext, origin: string, query: { sent: string | undefined; error: string | undefined; values: string | undefined }): Promise<View> {
  const { t, locale, sql, offerMail, offerChat } = context;
  const error = refusal(query.error);
  const values = sentBack(query.values);
  const w = t.subscribe;
  const noMail = !offerMail || error === "no_mail";
  const onEmail = error !== null && refusalAbout(error, "subscribe");
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
            <Honeypot action="subscribe" />
            <div>
              <label className="label" htmlFor="email">{w.email}</label>
              <input id="email" name="email" type="email" className="field" autoComplete="email" required maxLength={254} defaultValue={values["email"] ?? ""} aria-invalid={onEmail || undefined} aria-describedby={error ? (onEmail ? "email-error" : "form-error") : undefined} />
              {/* The address's refusal, next to it: filled here without
                  JavaScript, by the package's script with it (the same place). */}
              <p id="email-error" className="error" role="alert" hidden={!onEmail}>{onEmail ? format(t.errors[error], values) : ""}</p>
            </div>
            <ChoiceFields options={await followOptions(sql, locale)} chosen={null} t={w} />
            {error && !onEmail && <p id="form-error" className="error" role="alert">{format(t.errors[error], values)}</p>}
            <div><button type="submit" className="button">{w.submit}</button></div>
            <p className="fine">{w.privacy}</p>
          </form>
          {chat}
        </section>
      )}
    </PublicShell>
  ) };
}
