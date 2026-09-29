import { AppShell, BrandMark } from "@argentic/chest-ui/components";
import type { ReactNode } from "react";
import { Mark } from "../../../components/mark.tsx";
import { roleOf } from "../../../lib/access.ts";
import { viewer } from "../../../lib/session.ts";
import { currentLook } from "../../../lib/look.ts";

// The work pages in the kit's shell: the mark (home) — the company's logo
// beside the name when the Chest gives its brand —, who you are. Forms has
// one section (the forms; a form's own tabs are in its page), so no tabs
// in the header.
export default async function WorkLayout({ children }: { children: ReactNode }) {
  const [v, look] = await Promise.all([viewer(), currentLook()]);
  if (!v) return null;
  const { member, t } = v;
  const role = roleOf(member);
  return (
    <AppShell
      brand={<a href="/chest"><BrandMark logo={look.logo}><Mark /></BrandMark><span>{t.meta.name}</span></a>}
      member={{ name: member.name, role: role ? t.roles[role] : null, photo: member.photo }}
      labels={{ skip: t.shell.skip, nav: t.shell.nav }}
      width="wide"
    >
      <div className="work">{children}</div>
    </AppShell>
  );
}
