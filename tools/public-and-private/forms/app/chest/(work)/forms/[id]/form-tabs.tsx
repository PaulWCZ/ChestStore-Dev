"use client";

import { Tabs } from "@argentic/chest-ui/components";
import { usePathname } from "next/navigation";
import { GuardedLink } from "../../../../../components/guarded-link.tsx";

// A form's tabs — Questions, Share, Settings (editors), Answers (the
// table and the summary) —, the kit's link tabs. Four labelled tabs at
// most: they fit a phone. Each waits for the page's save before it leaves
// (components/guarded-link.tsx).
export function FormTabs({ base, editor, label, words }: { base: string; editor: boolean; label: string; words: { build: string; share: string; settings: string; answers: string } }) {
  const path = usePathname();
  const current = path === base ? "build" : path.startsWith(`${base}/share`) ? "share" : path.startsWith(`${base}/settings`) ? "settings" : "answers";
  const items = [
    { id: "build", label: words.build, href: base },
    { id: "share", label: words.share, href: `${base}/share` },
    ...(editor ? [{ id: "settings", label: words.settings, href: `${base}/settings` }] : []),
    { id: "answers", label: words.answers, href: `${base}/answers` },
  ];
  return <Tabs items={items} current={current} label={label} link={GuardedLink} />;
}
