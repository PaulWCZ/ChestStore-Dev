import { ChestError } from "@argentic/chest-sdk/errors";
import * as members from "@argentic/chest-sdk/members";
import { headers } from "next/headers";
import { atLeast } from "../../../../../../lib/access.ts";
import { db } from "../../../../../../lib/db.ts";
import { open, openState, team, versionOf } from "../../../../../../lib/forms.ts";
import { nameOf, people } from "../../../../../../lib/people.ts";
import { formLink } from "../../../../../../lib/public-origin.ts";
import { viewer } from "../../../../../../lib/session.ts";
import { ShareView } from "./share-view.tsx";

// Share: the link (and a prefilled one), and the people who may open the
// form besides its owner.
export default async function SharePage({ params }: { params: Promise<{ id: string }> }) {
  const v = await viewer();
  if (!v) return null;
  const { t, locale, member } = v;
  const sql = db();
  const { form, level } = await open(sql, member, (await params).id);
  const def = form.version > 0 ? await versionOf(sql, form.id, form.version) : null;
  const { owner, shared } = await team(sql, form.id);
  const who = await people([owner, ...shared.map(s => s.member)]);
  let candidates: { id: string; name: string }[] = [];
  if (atLeast(level, "owner")) {
    try {
      const taken = new Set([owner, ...shared.map(s => s.member)]);
      candidates = (await members.list({ limit: 500 })).members.filter(m => !taken.has(m.id) && m.role !== null).map(m => ({ id: m.id, name: m.name }));
    } catch (error) {
      if (!(error instanceof ChestError)) throw error;
    }
  }
  const questions = (def?.pages.flatMap(p => p.questions) ?? []).filter(q => !["statement", "file"].includes(q.kind)).map(q => ({ id: q.id, title: q.title, kind: q.kind, options: (q.options ?? []).map(o => o.label) }));
  return (
    <ShareView
      formId={form.id}
      link={def ? formLink(await headers(), form) : null}
      open={openState(form).open}
      audience={form.audience}
      questions={questions}
      owner={{ id: owner, name: owner === member.id ? t.people.you : nameOf(who.get(owner), locale), photo: who.get(owner)?.photo ?? null }}
      shared={shared.map(s => ({ id: s.member, level: s.level === "editor" ? "editor" as const : "viewer" as const, name: s.member === member.id ? t.people.you : nameOf(who.get(s.member), locale), photo: who.get(s.member)?.photo ?? null }))}
      candidates={candidates}
      canManage={atLeast(level, "owner")}
      t={{ share: t.share, levels: t.levels, errors: t.errors, yes: t.respond.yes, no: t.respond.no }}
    />
  );
}
