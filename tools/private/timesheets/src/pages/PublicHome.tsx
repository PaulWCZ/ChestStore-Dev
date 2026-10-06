import type { PageContext, View, VisitorContext } from "@argentic/chest-app";

// The host's root. This tool has no public part (on a Chest its public
// host answers 404 itself): whoever lands here outside a Chest is told
// where the tool lives, in their language (the layout's switch).
export function publicHome({ t }: PageContext<VisitorContext>): View {
  return {
    title: t.tool.name,
    exactTitle: true,
    body: (
      <>
        <h1>{t.public.title}</h1>
        <p>{t.public.body}</p>
      </>
    ),
  };
}
