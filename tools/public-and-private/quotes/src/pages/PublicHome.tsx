import type { PageContext, View, VisitorContext } from "@argentic/chest-app";
import { company, goesBy } from "../lib/company.ts";
import { db } from "../lib/db.ts";

// The public host's root. The public part is only the quotes' own pages
// (/q/<secret>, reached from the link in a quote's email): nothing links
// here, and whoever lands here is told where to go, in their language —
// nothing of the company's documents is shown.
export async function publicHome({ t }: PageContext<VisitorContext>): Promise<View> {
  const c = await company(db());
  const name = goesBy(c) || t.meta.name;
  return {
    title: name,
    exactTitle: true,
    layout: { company: name },
    body: (
      <div className="answer-state off">
        <h1>{t.public.title}</h1>
        <p className="lead">{t.public.body}</p>
      </div>
    ),
  };
}
