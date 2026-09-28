import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Back, Globe, Mask, Users } from "../../../../../components/icons.tsx";
import { NavLink } from "../../../../../components/nav-link.tsx";
import { AppError } from "../../../../../lib/app-error.ts";
import { db } from "../../../../../lib/db.ts";
import { open, openState } from "../../../../../lib/forms.ts";
import { viewer } from "../../../../../lib/session.ts";

// A form's frame: its name, its state, and its tabs — Questions, Share,
// Settings, Answers, Summary. A form the member may not open is not found.
export default async function FormLayout({ children, params }: { children: ReactNode; params: Promise<{ id: string }> }) {
  const v = await viewer();
  if (!v) return null;
  const { t } = v;
  const { id } = await params;
  const found = await open(db(), v.member, id).catch(error => {
    if (error instanceof AppError) return null;
    throw error;
  });
  if (!found) notFound();
  const { form } = found;
  const state = openState(form);
  const status = form.status === "draft" ? "draft" : state.open ? "open" : (state.reason ?? "closed");
  const base = `/chest/forms/${form.id}`;
  return (
    <div className="form-frame">
      <div className="form-top">
        <a className="back-link" href="/chest"><Back />{t.shell.home}</a>
        <div className="form-name">
          <h1>{form.draft.title || t.builder.untitled}</h1>
          <span className={`status status-${status}`}>{t.status[status as keyof typeof t.status]}</span>
          <span className="audience">
            {form.audience === "public" ? <><Globe />{t.home.public}</> : form.anonymous ? <><Mask />{t.home.anonymous}</> : <><Users />{t.home.team}</>}
          </span>
        </div>
        <nav className="tabs" aria-label={t.tabs.label}>
          <NavLink href={base} exact>{t.tabs.build}</NavLink>
          <NavLink href={`${base}/share`}>{t.tabs.share}</NavLink>
          <NavLink href={`${base}/settings`}>{t.tabs.settings}</NavLink>
          <NavLink href={`${base}/answers`}>{t.tabs.answers}</NavLink>
          <NavLink href={`${base}/summary`}>{t.tabs.summary}</NavLink>
        </nav>
      </div>
      {children}
    </div>
  );
}
