import { Back, Download } from "../components/icons.tsx";
import type { PageContext, View } from "../core/http.tsx";
import { Island } from "../core/island.tsx";
import { notFound } from "../core/tool.ts";
import { can } from "../lib/access.ts";
import { importLimits } from "../lib/transfer.ts";

// Moving posts in (a Slack channel) and out (every post, as a ZIP):
// publishers only.
export function transferPage({ member, t, locale }: PageContext): View {
  if (!can(member, "publish")) return notFound();
  return { title: t.transfer.title, body: (
    <div className="narrow transfer">
      <a className="back" href="/chest"><Back />{t.post.back}</a>
      <h1>{t.transfer.title}</h1>
      <section className="side-card">
        <h2>{t.transfer.importTitle}</h2>
        <p>{t.transfer.importBody}</p>
        <p className="hint">{t.transfer.importHow}</p>
        <Island name="SlackImport" props={{ t: t.transfer, errors: t.errors, files: t.files, maxSize: importLimits.size, locale }} />
      </section>
      <section className="side-card">
        <h2>{t.transfer.exportTitle}</h2>
        <p>{t.transfer.exportBody}</p>
        <p><a className="button quiet" href="/chest/transfer/export" download><Download />{t.transfer.exportButton}</a></p>
      </section>
    </div>
  ) };
}
