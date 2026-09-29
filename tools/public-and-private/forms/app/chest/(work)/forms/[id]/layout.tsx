import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Back, Globe, Mask, Users } from "../../../../../components/icons.tsx";
import { NavLink } from "../../../../../components/nav-link.tsx";
import { atLeast } from "../../../../../lib/access.ts";
import { AppError } from "../../../../../lib/app-error.ts";
import { db } from "../../../../../lib/db.ts";
import { open, openState } from "../../../../../lib/forms.ts";
import { viewer } from "../../../../../lib/session.ts";
import { FormTitle, StatusControl } from "./form-head.tsx";

// A form's frame: its name, its state (and, for its editors, the one
// action that changes it: stop or take answers again), and its tabs —
// Questions, Share, Settings (editors), Answers (the table and the
// summary). Four labelled tabs at most: they fit a phone. A form the
// member may not open is not found.
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
  const { form, level } = found;
  const state = openState(form);
  const status = form.status === "draft" ? "draft" : state.open ? "open" : (state.reason ?? "closed");
  const base = `/chest/forms/${form.id}`;
  const editor = atLeast(level, "editor");
  return (
    <div className="form-frame">
      <div className="form-top">
        <NavLink className="back-link" href="/chest"><Back />{t.shell.home}</NavLink>
        <div className="form-name">
          <FormTitle initial={form.draft.title} untitled={t.builder.untitled} />
          <span className={`status status-${status}`}>{t.status[status as keyof typeof t.status]}</span>
          <span className="audience">
            {form.audience === "public" ? (<><Globe />{t.home.public}</>) : form.anonymous ? (<><Mask />{t.home.anonymous}</>) : (<><Users />{t.home.team}</>)}
          </span>
          {editor && form.version > 0 && (form.status === "published" || form.status === "closed") && (
            <StatusControl formId={form.id} open={form.status === "published"} canReopen={!(form.maxAnswers !== null && form.answerCount >= form.maxAnswers)} t={{ close: t.builder.closeForm, reopen: t.builder.reopen, closed: t.builder.closedToast, reopened: t.builder.reopened, errors: t.errors }} />
          )}
        </div>
        <nav className="tabs" aria-label={t.tabs.label}>
          <NavLink href={base} exact>{t.tabs.build}</NavLink>
          <NavLink href={`${base}/share`}>{t.tabs.share}</NavLink>
          {editor && <NavLink href={`${base}/settings`}>{t.tabs.settings}</NavLink>}
          <NavLink href={`${base}/answers`} also={[`${base}/summary`]}>{t.tabs.answers}</NavLink>
        </nav>
      </div>
      {children}
    </div>
  );
}
