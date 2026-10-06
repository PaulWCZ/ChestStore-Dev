import { Island } from "@argentic/chest-app";
import { Tabs } from "@argentic/chest-ui/components";
import type { ReactNode } from "react";
import { Back, Globe, Mask, Users } from "../components/icons.tsx";
import { StateBadge } from "../components/state-badge.tsx";
import type { Catalogue, Locale } from "../i18n/index.ts";
import { atLeast, type Level } from "../lib/access.ts";
import { openState, type Form } from "../lib/forms.ts";
import { capOf, readIn } from "../shared/model.ts";

export type Tab = "build" | "share" | "settings" | "answers";

// A form's frame: its name (which follows the title as the builder types
// it), its state and — for its editors — the one action that changes it
// (stop or take answers again), and its tabs: Questions, Share, Settings
// (editors), Answers (the table and the summary). Four labelled tabs at
// most: they fit a phone; the shown one is kept in view (KeepInView).
// Every link of the frame waits for a page's save before it leaves (the
// builder's and the settings' own guard).
export function FormFrame({ form, level, tab, t, lang, children }: { form: Form; level: Level; tab: Tab; t: Catalogue; lang: Locale; children: ReactNode }) {
  const state = openState(form);
  const status = form.status === "draft" ? "draft" : state.open ? "open" : (state.reason ?? "closed");
  const base = `/chest/forms/${form.id}`;
  const editor = atLeast(level, "editor");
  const items = [
    { id: "build", label: t.tabs.build, href: base },
    { id: "share", label: t.tabs.share, href: `${base}/share` },
    ...(editor ? [{ id: "settings", label: t.tabs.settings, href: `${base}/settings` }] : []),
    { id: "answers", label: t.tabs.answers, href: `${base}/answers` },
  ];
  return (
    <div className="form-frame">
      <div className="form-top">
        <a className="back-link" href="/chest"><Back />{t.shell.home}</a>
        <div className="form-name">
          <Island id="form-title" name="FormTitle" props={{ initial: readIn(form.draft, lang).title, untitled: t.builder.untitled }} />
          <StateBadge state={status} label={t.status[status as keyof Catalogue["status"]]} />
          <span className="audience">
            {form.audience === "public" ? <><Globe />{t.home.public}</> : form.anonymous ? <><Mask />{t.home.anonymous}</> : <><Users />{t.home.team}</>}
          </span>
          {editor && form.version > 0 && (form.status === "published" || form.status === "closed") && !(form.status === "closed" && form.answerCount >= capOf(form)) && (
            <Island id={`state-${form.id}`} name="StatusControl" props={{ formId: form.id, open: form.status === "published", t: { close: t.builder.closeForm, reopen: t.builder.reopen, closed: t.builder.closedToast, reopened: t.builder.reopened } }} />
          )}
        </div>
        <div>
          <Tabs items={items} current={tab} label={t.tabs.label} />
          <Island name="KeepInView" props={{ selector: ".form-top .ck-tab[aria-current]", current: tab }} />
        </div>
      </div>
      {children}
    </div>
  );
}
