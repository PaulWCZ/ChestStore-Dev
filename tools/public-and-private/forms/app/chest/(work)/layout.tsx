import type { ReactNode } from "react";
import { Avatar } from "../../../components/avatar.tsx";
import { Mark } from "../../../components/mark.tsx";
import { roleOf } from "../../../lib/access.ts";
import { viewer } from "../../../lib/session.ts";

// The tool's bar on its work pages: the mark (home), who you are.
export default async function WorkLayout({ children }: { children: ReactNode }) {
  const v = await viewer();
  if (!v) return null;
  const { member, t } = v;
  const role = roleOf(member);
  return (
    <>
      <a className="skip" href="#main">{t.shell.skip}</a>
      <header className="bar">
        <a className="brand" href="/chest"><Mark /><span>{t.meta.name}</span></a>
        <span className="who">
          <span className="who-text"><span>{member.firstName || member.name}</span>{role && <span className="who-role">{t.roles[role]}</span>}</span>
          <Avatar name={member.name} photo={member.photo} size={30} />
        </span>
      </header>
      <main id="main" className="work">{children}</main>
    </>
  );
}
