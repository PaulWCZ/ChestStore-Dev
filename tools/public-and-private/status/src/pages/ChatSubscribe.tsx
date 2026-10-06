import { Honeypot, type View } from "@argentic/chest-app";
import { Back, Chat } from "../components/icons.tsx";
import { format } from "../i18n/index.ts";
import { hookKinds, hooksDelivery } from "../lib/hooks.ts";
import { followOptions } from "../lib/options.ts";
import type { PublicContext } from "../lib/public-page.ts";
import { ChoiceFields } from "./parts/choice-fields.tsx";
import { siteTitle, unindexed } from "./parts/meta.tsx";
import { PublicShell } from "./parts/public-shell.tsx";
import { refusal, sentBack } from "./Subscribe.tsx";

// Get updates in a chat (Proposal (studio): webhooks): where (Slack, Teams,
// a web address), its address, what to follow, one button. Works without
// JavaScript; where to find the address is one fold away. The Chest checks
// the address before anything is kept.
export async function chatSubscribePage(context: PublicContext, query: { error: string | undefined; kind: string | undefined; values: string | undefined }): Promise<View> {
  const { t, locale, sql } = context;
  const error = refusal(query.error);
  const values = sentBack(query.values);
  const w = t.hooks;
  const asked = values["kind"] ?? query.kind;
  const chosen = (hookKinds as readonly string[]).includes(asked ?? "") ? asked : "slack";
  // Asked of the Chest now (webhooks.available()): never a form it would refuse.
  const state = (await hooksDelivery(sql)).state;
  const off: "no_hooks" | "hooks_paused" | null = error === "hooks_paused" || state === "paused" ? "hooks_paused" : error === "no_hooks" || state === "none" ? "no_hooks" : null;
  return { title: siteTitle(context, w.title), exactTitle: true, head: unindexed, body: (
    <PublicShell context={context} path="/subscribe/chat" offerMail={false}>
      <p className="crumb"><a href="/subscribe"><Back />{t.subscribe.title}</a></p>
      {off ? (
        <section className="card narrow">
          <h1>{w.title}</h1>
          <p>{t.errors[off]}</p>
        </section>
      ) : (
        <section className="card narrow">
          <h1>{w.title}</h1>
          <p className="lead">{w.intro}</p>
          <form method="post" action="/actions/subscribeChat" className="stack form">
            <Honeypot />
            <fieldset className="choices">
              <legend>{w.where}</legend>
              {hookKinds.map(k => <label key={k} className="choice"><input type="radio" name="kind" value={k} defaultChecked={k === chosen} />{w.kinds[k]}</label>)}
            </fieldset>
            <div>
              <label className="label" htmlFor="url">{w.url}</label>
              <input id="url" name="url" type="url" inputMode="url" className="field" required maxLength={2048} spellCheck={false} autoComplete="off" defaultValue={values["url"] ?? ""} aria-invalid={error?.startsWith("hook_") || undefined} aria-describedby={error ? "form-error" : undefined} />
              <details className="where-hint">
                <summary><Chat />{w.whereFind}</summary>
                <ul className="fine">{hookKinds.map(k => <li key={k}>{w.urlHints[k]}</li>)}</ul>
              </details>
            </div>
            <ChoiceFields options={await followOptions(sql, locale)} chosen={null} t={t.subscribe} />
            {error && <p id="form-error" className="error" role="alert">{format(t.errors[error], values)}</p>}
            <div><button type="submit" className="button">{w.submit}</button></div>
            <p className="fine">{w.privacy}</p>
          </form>
        </section>
      )}
    </PublicShell>
  ) };
}
