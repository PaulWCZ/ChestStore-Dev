"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useTransition } from "react";
import { Chart, Close, Copy, Dots, Download, Duplicate, External, Gear, Globe, Pencil, Plus, Share, Undo, Upload } from "../../../../components/icons.tsx";
import { useToast } from "../../../../components/toast.tsx";
import type { Catalogue } from "../../../../lib/i18n/index.ts";
import type { JobState } from "../../../../lib/model.ts";
import { duplicateJob, setJobState } from "../../actions.ts";

type Words = { board: Catalogue["board"]; errors: Catalogue["errors"]; common: Catalogue["common"] };

// A job's actions for a recruiter: the one that matters now (publish a
// draft; add a candidate to an open job), the others in a menu. Every
// change of state can be undone.
export function JobActions({ job, link, share, t }: { job: { id: string; state: JobState; hasDescription: boolean }; link: string; share: { linkedin: string; x: string; email: string }; t: Words }) {
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const menu = useRef<HTMLDetailsElement>(null);
  const w = t.board;

  function change(state: JobState, done: string) {
    if (menu.current) menu.current.open = false;
    start(async () => {
      const r = await setJobState(job.id, state);
      if (!r.ok) return toast(t.errors[r.error]);
      const previous = r.value.previous as JobState;
      toast(done, { label: t.common.undo, run: () => start(async () => { await setJobState(job.id, previous); }) });
    });
  }
  async function copy() {
    if (menu.current) menu.current.open = false;
    try {
      await navigator.clipboard.writeText(link);
      toast(t.common.copied);
    } catch {
      window.prompt(w.copyLink, link);
    }
  }

  function duplicate() {
    if (menu.current) menu.current.open = false;
    start(async () => {
      const r = await duplicateJob(job.id);
      if (!r.ok) return toast(t.errors[r.error]);
      toast(w.duplicated);
      router.push(`/chest/jobs/${r.value.id}/edit`);
    });
  }

  return (
    <div className="job-actions">
      {job.state === "draft" && <button type="button" className="button" disabled={pending || !job.hasDescription} onClick={() => change("open", w.published)} title={w.publishHint}><Globe />{w.publish}</button>}
      {job.state === "closed" && <button type="button" className="button" disabled={pending} onClick={() => change("open", w.published)}><Globe />{w.reopen}</button>}
      <Link className={job.state === "open" ? "button" : "button quiet"} href={`/chest/jobs/${job.id}/add`}><Plus />{w.add}</Link>
      <details className="menu" ref={menu}>
        <summary className="button quiet icon-only" title={w.menu}><Dots /><span className="visually-hidden">{w.menu}</span></summary>
        <div className="menu-pop">
          <Link href={`/chest/jobs/${job.id}/edit`}><Pencil />{w.edit}</Link>
          <Link href={`/chest/jobs/${job.id}/settings`}><Gear />{w.settings}</Link>
          {job.state !== "draft" && <a href={link} target="_blank" rel="noopener"><External />{w.viewPublic}</a>}
          {job.state === "open" && <button type="button" onClick={copy}><Copy />{w.copyLink}</button>}
          {job.state === "open" && <a href={share.linkedin} target="_blank" rel="noopener noreferrer"><Share />{w.shareLinkedIn}</a>}
          {job.state === "open" && <a href={share.x} target="_blank" rel="noopener noreferrer"><Share />{w.shareX}</a>}
          {job.state === "open" && <a href={share.email}><Share />{w.shareEmail}</a>}
          <hr />
          <button type="button" onClick={duplicate} disabled={pending}><Duplicate />{w.duplicate}</button>
          <Link href={`/chest/jobs/${job.id}/import`}><Upload />{w.import}</Link>
          <Link href={`/chest/reports?job=${job.id}`}><Chart />{w.report}</Link>
          <a href={`/chest/jobs/${job.id}/export`} download><Download />{w.export}</a>
          {job.state === "open" && <><hr /><button type="button" onClick={() => change("closed", w.closedToast)}><Close />{w.close}</button></>}
          {job.state === "closed" && <><hr /><button type="button" onClick={() => change("draft", w.draftNotice)}><Undo />{w.toDraft}</button></>}
        </div>
      </details>
    </div>
  );
}
