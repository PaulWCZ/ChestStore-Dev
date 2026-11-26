import type { View } from "@argentic/chest-app";
import { Back } from "../components/icons.tsx";
import type { PublicContext } from "../lib/public-page.ts";
import { siteTitle, unindexed } from "./parts/meta.tsx";
import { PublicShell } from "./parts/public-shell.tsx";

// After unsubscribing: the address is gone, and the page says so.
export function unsubscribedPage(context: PublicContext): View {
  const { t, offerUpdates } = context;
  return { title: siteTitle(context, t.subscriber.goneTitle), exactTitle: true, head: unindexed, body: (
    <PublicShell context={context} path="/unsubscribed" offerMail={offerUpdates}>
      <p className="crumb"><a href="/"><Back />{t.subscribe.backToStatus}</a></p>
      <section className="card narrow">
        <h1>{t.subscriber.goneTitle}</h1>
        <p>{t.subscriber.goneBody}</p>
      </section>
    </PublicShell>
  ) };
}
