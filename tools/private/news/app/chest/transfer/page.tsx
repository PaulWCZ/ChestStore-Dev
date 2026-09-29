import { notFound } from "next/navigation";
import { Back, Download } from "../../../components/icons.tsx";
import { can } from "../../../lib/access.ts";
import { viewer } from "../../../lib/session.ts";
import { SlackImport } from "./slack-import.tsx";

// Moving posts in (a Slack channel) and out (every post, as a ZIP):
// publishers only.
export default async function Transfer() {
  const v = await viewer();
  if (!v) return null;
  const { member, t, locale } = v;
  if (!can(member, "publish")) notFound();
  return (
    <main className="narrow transfer">
      <a className="back" href="/chest"><Back />{t.post.back}</a>
      <h1>{t.transfer.title}</h1>
      <section className="side-card">
        <h2>{t.transfer.importTitle}</h2>
        <p>{t.transfer.importBody}</p>
        <p className="hint">{t.transfer.importHow}</p>
        <SlackImport t={t.transfer} errors={t.errors} undo={t.post.undo} locale={locale} />
      </section>
      <section className="side-card">
        <h2>{t.transfer.exportTitle}</h2>
        <p>{t.transfer.exportBody}</p>
        <p><a className="button quiet" href="/chest/transfer/export" download><Download />{t.transfer.exportButton}</a></p>
      </section>
    </main>
  );
}
