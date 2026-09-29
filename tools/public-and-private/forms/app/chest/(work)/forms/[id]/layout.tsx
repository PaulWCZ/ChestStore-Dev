import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Back, Globe, Mask, Users } from "../../../../../components/icons.tsx";
import { GuardedLink } from "../../../../../components/guarded-link.tsx";
import { atLeast } from "../../../../../lib/access.ts";
import { AppError } from "../../../../../lib/app-error.ts";
import { db } from "../../../../../lib/db.ts";
import { open, openState } from "../../../../../lib/forms.ts";
import { viewer } from "../../../../../lib/session.ts";
import { FormTitle, StatusControl } from "./form-head.tsx";
import { FormTabs } from "./form-tabs.tsx";
import { StateBadge } from "../../../../../components/state-badge.tsx";

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
        <GuardedLink className="back-link" href="/chest"><Back />{t.shell.home}</GuardedLink>
        <div className="form-name">
          <FormTitle initial={form.draft.title} untitled={t.builder.untitled} />
          <StateBadge state={status} label={t.status[status as keyof typeof t.status]} />
          <span className="audience">
            {form.audience === "public" ? (<><Globe />{t.home.public}</>) : form.anonymous ? (<><Mask />{t.home.anonymous}</>) : (<><Users />{t.home.team}</>)}
          </span>
          {editor && form.version > 0 && (form.status === "published" || form.status === "closed") && (
            <StatusControl formId={form.id} open={form.status === "published"} canReopen={!(form.maxAnswers !== null && form.answerCount >= form.maxAnswers)} t={{ close: t.builder.closeForm, reopen: t.builder.reopen, closed: t.builder.closedToast, reopened: t.builder.reopened, errors: t.errors }} />
          )}
        </div>
        <FormTabs base={base} editor={editor} label={t.tabs.label} words={{ build: t.tabs.build, share: t.tabs.share, settings: t.tabs.settings, answers: t.tabs.answers }} />
      </div>
      {children}
    </div>
  );
}
