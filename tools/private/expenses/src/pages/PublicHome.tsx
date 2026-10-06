import type { PageContext, View } from "@argentic/chest-app";
import type { VisitorContext } from "@argentic/chest-app";

// The public host's root. Expenses has no public part (a Chest answers 404
// there): whoever reaches it another way is told where the tool lives, in
// their language (the layout's switch).
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
