import type { PageContext, View } from "@argentic/chest-app";
import type { VisitorContext } from "@argentic/chest-app";

// The public host's root. People has no public part: whoever lands here
// (the tool's own process opened directly) is told where it lives, in
// their language; the layout gives the language switch.
export function publicHome({ t }: PageContext<VisitorContext>): View {
  return {
    title: t.public.title,
    body: (
      <div className="public-home">
        <h1>{t.public.title}</h1>
        <p>{t.public.body}</p>
      </div>
    ),
  };
}
