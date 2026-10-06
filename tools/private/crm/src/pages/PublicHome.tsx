import type { PageContext, View } from "@argentic/chest-app";
import type { VisitorContext } from "@argentic/chest-app";

// The host's root. Clients has no public part (a Chest answers 404 on its
// public host); opened from the tool's own process, this page says where
// Clients lives, in the visitor's language.
export function publicHome({ t }: PageContext<VisitorContext>): View {
  return { title: t.public.title, body: <div className="stack"><h1>{t.public.title}</h1><p>{t.public.body}</p></div> };
}
