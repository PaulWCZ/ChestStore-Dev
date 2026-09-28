import Link from "next/link";
import { notFound } from "next/navigation";
import { Back } from "../../../../../components/icons.tsx";
import { db } from "../../../../../lib/db.ts";
import { AppError } from "../../../../../lib/errors.ts";
import { groupsOfTool } from "../../../../../lib/groups.ts";
import { colors } from "../../../../../lib/model.ts";
import { viewer } from "../../../../../lib/session.ts";
import { space, type Space } from "../../../../../lib/spaces.ts";
import { SpaceSettings } from "./settings.tsx";

// A space's settings, for editors: its name, what it holds, its colour,
// who reads it; deleting it when it is empty.
export default async function SettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, t } = v;
  const { id } = await params;
  let s: Space;
  try {
    s = await space(db(), member, id, "write");
  } catch (error) {
    if (error instanceof AppError) notFound();
    throw error;
  }
  const known = await groupsOfTool();
  // A group the space names that the Chest no longer lists stays shown, so
  // saving does not drop it silently.
  const groups = [...known, ...s.groups.filter(g => !known.some(k => k.id === g)).map(g => ({ id: g, name: g }))];
  return (
    <main className="page narrow">
      <Link className="back" href={`/chest/spaces/${s.id}`}><Back />{t.settings.back}</Link>
      <h1>{t.settings.title}</h1>
      <SpaceSettings
        space={{ id: s.id, name: s.name, description: s.description, color: s.color, visibility: s.visibility, groups: s.groups, pages: s.pages }}
        groups={groups}
        colors={[...colors]}
        t={{ settings: t.settings, errors: t.errors }}
      />
    </main>
  );
}
