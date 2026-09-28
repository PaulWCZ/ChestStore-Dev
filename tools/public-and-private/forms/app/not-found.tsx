import { viewer, publicWords } from "../lib/session.ts";

// Nothing here: a member is offered the way back to their forms; a visitor
// of the public host (a wrong or old link) is told to check it.
export default async function NotFound() {
  const v = await viewer();
  if (v) {
    return (
      <main className="page" id="main">
        <div className="empty">
          <h1>{v.t.notFound.title}</h1>
          <p>{v.t.notFound.body}</p>
          <a className="button quiet" href="/chest">{v.t.notFound.back}</a>
        </div>
      </main>
    );
  }
  const { t } = await publicWords();
  return (
    <div className="respond-page" data-accent="berry">
      <div className="respond-glow" aria-hidden="true" />
      <div />
      <main className="respond-main" id="main">
        <section className="runner runner-notice">
          <h1 className="runner-title">{t.notFound.formTitle}</h1>
          <p className="runner-lede">{t.notFound.formBody}</p>
        </section>
      </main>
      <div />
    </div>
  );
}
