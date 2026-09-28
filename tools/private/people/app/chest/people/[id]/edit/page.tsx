import Link from "next/link";
import { notFound } from "next/navigation";
import { Back } from "../../../../../components/icons.tsx";
import { can } from "../../../../../lib/access.ts";
import { db } from "../../../../../lib/db.ts";
import { directory, type Entry } from "../../../../../lib/directory.ts";
import { format, monthNames } from "../../../../../lib/i18n/index.ts";
import { memberPattern } from "../../../../../lib/model.ts";
import { choices } from "../../../../../lib/profiles.ts";
import { viewer } from "../../../../../lib/session.ts";
import { orgChart, type OrgNode } from "../../../../../lib/tree.ts";
import { ProfileForm } from "./profile-form.tsx";

// Editing a profile: a person writes about themselves; HR keeps the job
// fields of anyone. Nobody else reaches this page.
export default async function EditPage({ params }: { params: Promise<{ id: string }> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  const { id } = await params;
  if (!memberPattern.test(id)) notFound();
  const mine = id === member.id;
  const hr = can(member, "profile.job");
  if (!mine && !hr) notFound();
  const sql = db();
  const { entries } = await directory(sql, member);
  const person = entries.find(e => e.id === id);
  if (!person) notFound();
  // The managers offered: anyone but the person and those below them (the
  // server refuses a loop anyway).
  const below = new Set<string>();
  const walk = (nodes: OrgNode<Entry>[], inside: boolean) => {
    for (const n of nodes) {
      const here = inside || n.person.id === id;
      if (here) below.add(n.person.id);
      walk(n.reports, here);
    }
  };
  walk(orgChart(entries).roots, false);
  below.add(id);
  const managers = entries.filter(e => !below.has(e.id)).map(e => ({ id: e.id, name: e.name }));
  if (person.managerId && !managers.some(m => m.id === person.managerId)) {
    const current = entries.find(e => e.id === person.managerId);
    if (current) managers.push({ id: current.id, name: current.name });
  }
  const known = hr ? await choices(sql, member) : { teams: [], offices: [], titles: [] };
  return (
    <main className="page narrow">
      <Link className="back" href={`/chest/people/${id}`}><Back />{person.name}</Link>
      <h1 className="edit-title">{mine ? t.edit.titleMine : format(t.edit.titleOther, { name: person.name })}</h1>
      <ProfileForm
        person={{ id: person.id, name: person.name, photo: person.photo, team: person.team }}
        own={mine ? { phone: person.phone, pronouns: person.pronouns, bio: person.bio, skills: person.skills, birthday: person.birthday } : null}
        job={hr ? { title: person.title, team: person.team, office: person.office, managerId: person.managerId, startDate: person.startDate, phone: person.phone } : null}
        jobView={{ title: person.title, team: person.team, office: person.office }}
        managers={managers}
        known={known}
        months={monthNames(locale)}
        t={{ edit: t.edit, errors: t.errors }}
      />
    </main>
  );
}
