import { call, navigate, toast } from "@argentic/chest-app/client";
import { useRef, useState } from "react";
import { Chart, Close, Copy, Dots, Download, Duplicate, External, Gear, Globe, Pencil, Plus, Share, Undo, Upload } from "../components/icons.tsx";
import type { Catalogue } from "../i18n/index.ts";
import { format } from "../shared/format.ts";
import type { JobState } from "../shared/model.ts";

type Words = { board: Catalogue["board"]; common: Catalogue["common"] };

// A job's actions for a recruiter: the one that matters now (publish a
// draft, reopen a closed job), adding a candidate by hand quietly, the
// others in a menu. Every change of state can be undone.
export function JobActions({ job, link, share, t }: { job: { id: string; state: JobState; hasDescription: boolean }; link: string; share: { linkedin: string; x: string; email: string }; t: Words }) {
  const [pending, setPending] = useState(false);
  const menu = useRef<HTMLDetailsElement>(null);
  const w = t.board;
  const close = () => { if (menu.current) menu.current.open = false; };

  async function change(state: JobState, done: string) {
    close();
    setPending(true);
    const r = await call("setJobState", { id: job.id, state });
    setPending(false);
    if (!r.ok) return;
    const previous = r.value.previous as JobState;
    toast({
      id: `job-state-${job.id}`,
      text: done,
      undo: async () => {
        const back = await call("setJobState", { id: job.id, state: previous }, { quiet: true });
        return back.ok || back.message;
      },
    });
  }
  async function copy() {
    close();
    try {
      await navigator.clipboard.writeText(link);
      toast({ id: `copy-${job.id}`, text: t.common.copied });
    } catch {
      toast({ id: `copy-${job.id}`, text: format(t.common.copyFailed, { link }), tone: "error" });
    }
  }
  async function duplicate() {
    close();
    setPending(true);
    const r = await call("duplicateJob", { id: job.id }, { refresh: false });
    setPending(false);
    if (!r.ok) return;
    toast(w.duplicated);
    await navigate(`/chest/jobs/${r.value.id}/edit`);
  }

  return (
    <div className="job-actions">
      {job.state === "draft" && <button type="button" className="button" disabled={pending || !job.hasDescription} onClick={() => void change("open", w.published)} title={w.publishHint}><Globe />{w.publish}</button>}
      {job.state === "closed" && <button type="button" className="button" disabled={pending} onClick={() => void change("open", w.published)}><Globe />{w.reopen}</button>}
      {/* Adding by hand is rare (a referral): quiet — reviewing the new
          candidates on the board is what this page is for. */}
      <a className="button quiet" href={`/chest/jobs/${job.id}/add`}><Plus />{w.add}</a>
      <details className="menu" ref={menu}>
        <summary className="button quiet icon-only" title={w.menu}><Dots /><span className="visually-hidden">{w.menu}</span></summary>
        <div className="menu-pop">
          <a href={`/chest/jobs/${job.id}/edit`}><Pencil />{w.edit}</a>
          <a href={`/chest/jobs/${job.id}/settings`}><Gear />{w.settings}</a>
          {job.state !== "draft" && <a href={link} target="_blank" rel="noopener"><External />{w.viewPublic}</a>}
          {job.state === "open" && <button type="button" onClick={() => void copy()}><Copy />{w.copyLink}</button>}
          {job.state === "open" && <a href={share.linkedin} target="_blank" rel="noopener noreferrer"><Share />{w.shareLinkedIn}</a>}
          {job.state === "open" && <a href={share.x} target="_blank" rel="noopener noreferrer"><Share />{w.shareX}</a>}
          {job.state === "open" && <a href={share.email}><Share />{w.shareEmail}</a>}
          <hr />
          <button type="button" onClick={() => void duplicate()} disabled={pending}><Duplicate />{w.duplicate}</button>
          <a href={`/chest/jobs/${job.id}/import`}><Upload />{w.import}</a>
          <a href={`/chest/reports?job=${job.id}`}><Chart />{w.report}</a>
          <a href={`/chest/jobs/${job.id}/export`} download><Download />{w.export}</a>
          {job.state === "open" && <><hr /><button type="button" onClick={() => void change("closed", w.closedToast)}><Close />{w.close}</button></>}
          {job.state === "closed" && <><hr /><button type="button" onClick={() => void change("draft", w.draftNotice)}><Undo />{w.toDraft}</button></>}
        </div>
      </details>
    </div>
  );
}
