"use client";

import { useRouter } from "next/navigation";
import { Confirm, Dialog, FilePicker, filesReady, Segmented, StatusBadge, TimeSelect, useToast, type PickedFile } from "@argentic/chest-ui/components";
import { addDays as addIsoDays, type DateWords, type DialogWords } from "@argentic/chest-ui/components/logic";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useDateProblems, WatchedDateField } from "../../../../components/date-problems.tsx";
import { HireDialog } from "../../../../components/hire-dialog.tsx";
import { Arrow, Ban, Bell, Bin, Calendar, Close, Copy, Dots, Download, Mail, Pencil, People, Send, Star, Undo, Upload } from "../../../../components/icons.tsx";
import type { Feedback } from "../../../../lib/candidates.ts";
import { fileSize, format, intl, languageNames, plural } from "../../../../lib/i18n/format.ts";
import type { Catalogue } from "../../../../lib/i18n/index.ts";
import type { Message } from "../../../../lib/messages.ts";
import { isCandidateReason, languages, limits, recommendations, type Language, type RejectReason } from "../../../../lib/model.ts";
import { durations, startTimes } from "../../../../lib/time.ts";

// The interview's start: the tool's own steps (07:00 to 20:45), as minutes.
const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const firstStart = toMinutes(startTimes[0]!), lastStart = toMinutes(startTimes.at(-1)!);
import { cvAccept, cvKinds, cvMaxSize, uploadCv } from "../../../../lib/upload.ts";
import { addNote, askFeedback, busyTimes, cancelAsk, cancelInterview, considerFor, editCandidate, eraseCandidate, giveFeedback, moveCandidate, rejectCandidate, rejectionsLeft, removeNote, restoreCandidate, scheduleInterview, sendInterviewLink, cancelInterviewLink, setCv, setPool, undoReject, writeTo, writtenOutside } from "../../actions.ts";
import { ReasonPicker } from "../../jobs/[id]/board-view.tsx";

type Errors = Catalogue["errors"];
type Fail = { ok: false; error: keyof Errors; values?: Record<string, string | number> };
const failed = (t: Errors, r: Fail) => format(t[r.error], r.values ?? {});

// ---- The recruiter's actions -----------------------------------------------

type ActionWords = { candidate: Catalogue["candidate"]; reject: Catalogue["reject"]; errors: Errors; common: Catalogue["common"]; apply: Catalogue["apply"]; board: Catalogue["board"]; hire: Catalogue["hire"]; write: Catalogue["write"]; interview: Catalogue["interview"]; dialog: DialogWords; date: DateWords; files: Catalogue["files"] };
type TemplateFile = { file: string; name: string; type: string; size: number };
type Template = { id: string; name: string; language: string; subject: string; body: string; attachments?: TemplateFile[] };
// A template's file, shown in the picker as already there (kept, never sent again by the browser).
const storedFile = (a: TemplateFile): PickedFile => ({ key: a.file, name: a.name, size: a.size, type: a.type, file: null, status: "ready", progress: 1, ref: a.file, error: null, stored: true });

export function CandidateActions({ jobId, candidate, stages, next, askable, draft, languageName, locale, write, interview, jobs, t }: {
  jobId: string;
  candidate: { id: string; name: string; status: "active" | "rejected"; stageId: string; email: string; phone: string; link: string; language: Language; inPool: boolean };
  stages: { id: string; name: string; hired: boolean }[];
  next: { id: string; name: string } | null;
  askable: { id: string; name: string; asked: boolean }[];
  draft: string;
  languageName: string;
  locale: string;
  write: { templates: Template[]; values: Record<string, string>; languageNames: Record<string, string> };
  interview: { people: { id: string; name: string }[]; preselected: string[]; today: string; zone: string; zoneId: string };
  jobs: { id: string; title: string }[];
  t: ActionWords;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [dialog, setDialog] = useState<"reject" | "ask" | "edit" | "erase" | "write" | "interview" | "move" | "consider" | null>(null);
  // Something typed in the open dialog: closing it asks first (the kit's
  // Dialog), a stray tap never loses a half-written email.
  const [dirty, setDirty] = useState(false);
  const typed = () => setDirty(true);
  const menu = useRef<HTMLDetailsElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const w = t.candidate;
  const stageName = (id: string) => stages.find(s => s.id === id)?.name ?? "";
  const close = () => { if (menu.current) menu.current.open = false; };
  const open = (d: NonNullable<typeof dialog>) => { close(); setDirty(false); setDialog(d); };
  const shut = () => { setDirty(false); setDialog(null); };

  const [hiring, setHiring] = useState<string | null>(null);
  const isHired = (id: string) => stages.find(s => s.id === id)?.hired === true;
  function request(to: string) {
    setDialog(null);
    if (isHired(to) && !isHired(candidate.stageId)) setHiring(to);
    else move(to);
  }
  function move(to: string, undo = true, day?: string | null) {
    const from = candidate.stageId;
    start(async () => {
      const r = await moveCandidate(candidate.id, to, day ?? undefined);
      if (!r.ok) return void toast({ text: failed(t.errors, r), tone: "error" });
      if (undo) toast({
        id: `move-${candidate.id}`,
        text: format(w.moved, { stage: stageName(to) }),
        undo: async () => {
          const back = await moveCandidate(candidate.id, from);
          return back.ok || failed(t.errors, back);
        },
      });
    });
  }

  function restore() {
    start(async () => {
      const r = await restoreCandidate(candidate.id);
      if (!r.ok) return void toast({ text: failed(t.errors, r), tone: "error" });
      toast(format(w.restored, { name: candidate.name, stage: stageName(candidate.stageId) }));
    });
  }

  async function replaceCv(f: File) {
    close();
    start(async () => {
      const sent = await uploadCv(f, "/chest/api/cv");
      if (!sent.ok) return void toast({ text: t.errors[sent.error === "cv_off" ? "unavailable" : sent.error], tone: "error" });
      const r = await setCv(candidate.id, sent.ticket, f.name);
      if (!r.ok) return void toast({ text: failed(t.errors, r), tone: "error" });
      toast(w.cvSaved);
    });
  }

  function pool(on: boolean) {
    close();
    start(async () => {
      const r = await setPool(candidate.id, on);
      if (!r.ok) return void toast({ text: failed(t.errors, r), tone: "error" });
      toast(on ? w.poolOn : w.poolOff);
    });
  }

  return (
    <div className="cand-actions">
      {candidate.status === "active" ? (
        <>
          {next && <button type="button" className="button" disabled={pending} onClick={() => request(next.id)}>{format(w.next, { stage: next.name })}<Arrow /></button>}
          <button type="button" className="button quiet" onClick={() => open("write")}><Mail />{t.write.action}</button>
          <button type="button" className="button quiet" onClick={() => open("interview")}><Calendar />{t.interview.action}</button>
          <button type="button" className="button quiet danger-text" onClick={() => open("reject")}><Ban />{w.reject}</button>
        </>
      ) : (
        <>
          <button type="button" className="button" disabled={pending} onClick={restore}><Undo />{w.restore}</button>
          <button type="button" className="button quiet" onClick={() => open("write")}><Mail />{t.write.action}</button>
        </>
      )}
      <details className="menu" ref={menu}>
        <summary className="button quiet icon-only" title={t.common.more}><Dots /><span className="visually-hidden">{t.common.more}</span></summary>
        <div className="menu-pop">
          {candidate.status === "active" && <button type="button" onClick={() => open("move")}><Arrow />{w.moveTo}…</button>}
          {candidate.status === "active" && <button type="button" onClick={() => open("ask")}><Bell />{w.ask}</button>}
          {jobs.length > 0 && <button type="button" onClick={() => open("consider")}><People />{w.consider}</button>}
          <button type="button" onClick={() => pool(!candidate.inPool)}><Star />{candidate.inPool ? w.leavePool : w.keepInPool}</button>
          <hr />
          <button type="button" onClick={() => open("edit")}><Pencil />{w.edit}</button>
          <button type="button" onClick={() => file.current?.click()}><Upload />{w.replaceCv}</button>
          <a href={`/chest/candidates/${candidate.id}/data`} download onClick={close}><Download />{w.theirData}</a>
          <hr />
          <button type="button" className="danger-text" onClick={() => open("erase")}><Bin />{w.erase}</button>
        </div>
      </details>
      <input ref={file} type="file" accept={cvAccept} className="visually-hidden" tabIndex={-1} aria-hidden="true" onChange={e => { const f = e.currentTarget.files?.[0]; e.currentTarget.value = ""; if (f) void replaceCv(f); }} />

      <HireDialog name={hiring ? candidate.name : null} today={interview.today} onCancel={() => setHiring(null)} onConfirm={day => { const to = hiring; setHiring(null); if (to) move(to, true, day); }} t={{ hire: t.hire, common: t.common, dialog: t.dialog, date: t.date }} />
      <Dialog open={dialog === "reject"} dirty={dirty} title={format(t.reject.title, { name: candidate.name })} onClose={shut} labels={t.dialog}>
        <RejectForm candidate={candidate} onTyped={typed} draft={draft} languageName={languageName} t={t} onDone={shut} />
      </Dialog>
      <Dialog open={dialog === "write"} dirty={dirty} size="l" title={format(t.write.title, { name: candidate.name })} onClose={shut} labels={t.dialog}>
        <WriteForm candidate={candidate} onTyped={typed} write={write} t={t} onDone={shut} />
      </Dialog>
      <Dialog open={dialog === "interview"} dirty={dirty} size="l" title={format(t.interview.dialogTitle, { name: candidate.name })} onClose={shut} labels={t.dialog}>
        <InterviewForm candidate={candidate} onTyped={typed} interview={interview} t={t} onDone={shut} />
      </Dialog>
      <Dialog open={dialog === "move"} title={w.moveTo} onClose={shut} labels={t.dialog}>
        <ul className="pick-list stage-picks">
          {stages.map(s => (
            <li key={s.id}>
              <button type="button" className="button quiet" disabled={s.id === candidate.stageId || pending} aria-current={s.id === candidate.stageId ? "step" : undefined} onClick={() => request(s.id)}>{s.name}</button>
            </li>
          ))}
        </ul>
      </Dialog>
      <Dialog open={dialog === "consider"} title={format(w.considerTitle, { name: candidate.name })} onClose={shut} labels={t.dialog}>
        <ConsiderForm candidateId={candidate.id} jobs={jobs} t={t} onDone={shut} />
      </Dialog>
      <Dialog open={dialog === "ask"} title={w.ask} onClose={shut} labels={t.dialog}>
        <AskForm candidateId={candidate.id} askable={askable} locale={locale} t={t} onDone={shut} />
      </Dialog>
      <Dialog open={dialog === "edit"} dirty={dirty} title={w.edit} onClose={shut} labels={t.dialog}>
        <EditForm candidate={candidate} onTyped={typed} t={t} onDone={shut} />
      </Dialog>
      <Confirm
        open={dialog === "erase"}
        title={format(w.eraseTitle, { name: candidate.name })}
        body={w.eraseBody}
        confirmLabel={w.eraseConfirm}
        cancelLabel={t.common.cancel}
        busy={pending}
        onCancel={shut}
        onConfirm={() => start(async () => {
          const r = await eraseCandidate(candidate.id);
          if (!r.ok) return void toast({ text: failed(t.errors, r), tone: "error" });
          shut();
          toast(format(w.erased, { name: candidate.name }));
          router.replace(`/chest/jobs/${jobId}`);
        })}
      />
    </div>
  );
}

// Rejecting: a reason (nothing chosen for the recruiter: the reasons are
// data the company answers for), a note, and the email in the candidate's
// language — which waits until the Undo is over, so Undo is true.
function RejectForm({ candidate, draft, languageName, t, onDone, onTyped }: { candidate: { id: string; name: string }; draft: string; languageName: string; t: ActionWords; onDone: () => void; onTyped: () => void }) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const [reason, setReason] = useState<RejectReason | null>(null);
  const [send, setSend] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const w = t.reject;
  const theirs = reason !== null && isCandidateReason(reason);
  return (
    <form className="stack" onSubmit={e => {
      e.preventDefault();
      if (!reason) return;
      const data = new FormData(e.currentTarget);
      setError(null);
      start(async () => {
        const r = await rejectCandidate(candidate.id, reason, String(data.get("note") ?? ""), { send: send && !theirs, text: String(data.get("text") ?? "") });
        if (!r.ok) return setError(failed(t.errors, r));
        onDone();
        const waiting = r.value.delivery === "waiting";
        const message = waiting ? w.doneWaiting : theirs ? w.doneClosed : w.done;
        const id = `reject-${candidate.id}`;
        let undone = false;
        // Undo brings them back and keeps the email from leaving; if it had
        // left meanwhile (the toast was held open), Undo says so.
        toast({
          id,
          text: format(message, { name: candidate.name, seconds: r.value.seconds }),
          ...(waiting ? { duration: r.value.seconds * 1000 } : {}),
          undo: async () => {
            undone = true;
            const back = await undoReject([candidate.id], r.value.at);
            if (!back.ok) return failed(t.errors, back);
            return back.value.left === 0 || format(w.undoLate, { name: candidate.name });
          },
        });
        // Once Undo is over, the email leaves: the same toast then says it
        // was sent, with no Undo (the kit's "sent" state).
        if (waiting) setTimeout(() => {
          if (undone) return;
          void rejectionsLeft([candidate.id], r.value.at).then(left => {
            if (!undone && left.ok && left.value.left > 0) toast({ id, text: format(w.sent, { name: candidate.name }), sent: true });
          });
        }, r.value.seconds * 1000 + 500);
      });
    }} onInput={onTyped}>
      <ReasonPicker reason={reason} onChange={setReason} t={w} />
      <div className="field-block">
        <label className="label" htmlFor="reject-note">{w.note} <span className="optional">{t.apply.optional}</span></label>
        <input id="reject-note" name="note" className="field" maxLength={limits.rejectNote} />
      </div>
      {!theirs && (
        <label className="check">
          <input type="checkbox" checked={send} onChange={e => setSend(e.target.checked)} />
          <span>{w.email}</span>
        </label>
      )}
      {send && !theirs && (
        <div className="field-block">
          <label className="visually-hidden" htmlFor="reject-text">{w.email}</label>
          <textarea id="reject-text" name="text" className="field" rows={9} maxLength={limits.emailText} defaultValue={draft} aria-describedby="reject-hint" />
          <p className="hint" id="reject-hint">{format(w.emailHint, { language: languageName })}</p>
        </div>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="form-actions">
        <button type="submit" className="button danger" disabled={pending || !reason}>{theirs ? w.confirmClosed : w.confirm}</button>
        <button type="button" className="button quiet" onClick={onDone}>{t.common.cancel}</button>
      </div>
    </form>
  );
}

// Writing to a candidate: a template (in their language first), the
// subject and the text filled with their name, the job, the company, and
// files (an offer letter: the template's, or added here). It leaves from
// the jobs mailbox; their answer comes back to their page, and the files
// stay in the conversation. Without email on this Chest, the recruiter's
// own mail app opens with the text (the files are kept here).
function WriteForm({ candidate, write, t, onDone, onTyped }: { candidate: { id: string; name: string; email: string; language: Language }; write: { templates: Template[]; values: Record<string, string>; languageNames: Record<string, string> }; t: ActionWords; onDone: () => void; onTyped: () => void }) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const [chosen, setChosen] = useState("");
  const [subject, setSubject] = useState("");
  const [text, setText] = useState("");
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const w = t.write;
  const groups = useMemo(() => {
    const langs = [...new Set(write.templates.map(x => x.language))];
    return langs.map(l => ({ language: l, items: write.templates.filter(x => x.language === l) }));
  }, [write.templates]);
  function pick(id: string) {
    setChosen(id);
    const found = write.templates.find(x => x.id === id);
    // The template's files replace the previous template's; those added
    // by hand stay.
    setFiles(list => [...(found?.attachments ?? []).map(storedFile), ...list.filter(f => !f.stored)]);
    if (!found) return;
    setSubject(format(found.subject, write.values));
    setText(format(found.body, write.values));
  }
  return (
    <form className="stack" onSubmit={e => {
      e.preventDefault();
      setError(null);
      start(async () => {
        const r = await writeTo(candidate.id, subject, text, {
          files: files.filter(f => !f.stored && f.ref).map(f => ({ ticket: f.ref!, name: f.name })),
          template: /^\d+$/u.test(chosen) ? chosen : "",
          templateFiles: files.filter(f => f.stored && f.ref).map(f => f.ref!),
        });
        if (!r.ok) return setError(failed(t.errors, r));
        onDone();
        if (r.value.status === "none") {
          // The Chest cannot send yet: the recruiter's own mail app.
          window.location.href = `mailto:${encodeURIComponent(r.value.to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
          await writtenOutside(r.value.message);
          toast(w.outside);
        } else if (r.value.status === "sent") toast({ id: `write-${candidate.id}`, text: format(w.sent, { name: candidate.name }), sent: true });
        else toast(w.queued);
      });
    }} onInput={onTyped}>
      <div className="field-block">
        <label className="label" htmlFor="write-template">{w.template}</label>
        <select id="write-template" className="field" value={chosen} onChange={e => pick(e.target.value)}>
          <option value="">{w.blank}</option>
          {groups.map(g => (
            <optgroup key={g.language} label={write.languageNames[g.language] ?? g.language}>
              {g.items.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
            </optgroup>
          ))}
        </select>
      </div>
      <div className="field-block">
        <label className="label" htmlFor="write-subject">{w.subject}</label>
        <input id="write-subject" className="field" required maxLength={limits.subject} value={subject} onChange={e => setSubject(e.target.value)} />
      </div>
      <div className="field-block">
        <label className="label" htmlFor="write-text">{w.text}</label>
        <textarea id="write-text" className="field" rows={10} required maxLength={limits.emailText} value={text} onChange={e => setText(e.target.value)} aria-describedby="write-hint" />
        <p className="hint" id="write-hint">{format(w.hint, { email: candidate.email })}</p>
      </div>
      <div className="field-block">
        <span className="label">{w.files} <span className="optional">{t.apply.optional}</span></span>
        <FilePicker label={w.files} files={files} onChange={setFiles} accept={cvKinds} maxFiles={5} maxSize={cvMaxSize} labels={t.files}
          upload={async file => {
            const sent = await uploadCv(file, "/chest/api/cv");
            return sent.ok ? { ok: true, ref: sent.ticket } : { ok: false, error: t.errors[sent.error === "cv_off" ? "unavailable" : sent.error === "cv_invalid" ? "file_invalid" : sent.error] };
          }} />
        <p className="hint">{w.filesHint}</p>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="form-actions">
        <button type="submit" className="button" disabled={pending || !subject.trim() || !text.trim() || !filesReady(files)}><Send />{w.send}</button>
        <button type="button" className="button quiet" onClick={onDone}>{t.common.cancel}</button>
      </div>
    </form>
  );
}

// Inviting to an interview, two ways. "They choose" (the default): who
// meets them, how long, between which days and hours — the candidate gets
// a link and picks a time when everyone is free (lib/self-schedule.ts).
// "I choose": a day, a time (in the Chest's zone), with the times the
// people are already in an interview that day. Either way the candidate
// gets an email with an .ics; the interviewers see it in their Chest
// calendar.
function InterviewForm({ candidate, interview, t, onDone, onTyped }: { candidate: { id: string; name: string }; onTyped: () => void; interview: { people: { id: string; name: string }[]; preselected: string[]; today: string; zone: string; zoneId: string }; t: ActionWords; onDone: () => void }) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const [mode, setMode] = useState<"link" | "time">("link");
  const [day, setDay] = useState<string | null>(null);
  const [time, setTime] = useState(600);
  const [minutes, setMinutes] = useState(60);
  const [people, setPeople] = useState<Set<string>>(new Set(interview.preselected.filter(p => interview.people.some(x => x.id === p))));
  const [busy, setBusy] = useState<{ member: string; start: string; end: string; source?: string }[]>([]);
  const [tell, setTell] = useState(true);
  const [skipLunch, setSkipLunch] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // The link's days (tomorrow to a week later) and hours (09:00–18:00).
  const [firstDay, setFirstDay] = useState<string | null>(addIsoDays(interview.today, 1));
  const [lastDay, setLastDay] = useState<string | null>(addIsoDays(interview.today, 8));
  const [dayStart, setDayStart] = useState(9 * 60);
  const [dayEnd, setDayEnd] = useState(18 * 60);
  // A Chest without email: the link, for the recruiter to send.
  const [link, setLink] = useState<string | null>(null);
  const w = t.interview;
  const names = new Map(interview.people.map(p => [p.id, p.name]));
  const firstNames = [...people].filter(id => names.has(id)).map(id => names.get(id)!.split(/\s+/u)[0]).join(", ");
  // The day, typed or picked in the member's language (the kit's
  // DateField: never the browser's date field), in the next 90 days.
  const last = addIsoDays(interview.today, 89);
  // A day the field refused (before today, past the 90 days, unreadable)
  // leaves the previous day in this state: sending waits, on the field and
  // its sentence, rather than send that day in its place.
  const dates = useDateProblems();
  const hhmmOf = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  const chosen = [...people];
  useEffect(() => {
    if (mode !== "time" || !day || chosen.length === 0) {
      setBusy([]);
      return;
    }
    let live = true;
    void busyTimes(chosen, day).then(r => { if (live && r.ok) setBusy(r.value); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, day, chosen.join(",")]);
  // Times as the Chest's zone reads them, from the server's answer.
  const hhmm = (iso: string) => new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: interview.zoneId }).format(new Date(iso));
  // Whose busy time, in words: an interview here, Booking's, or a day off
  // told by Leave (never the kind of leave: Leave never sends it; a whole
  // day reads 00:00–23:59 from the server).
  const busyLine = (b: { start: string; end: string; source?: string }) =>
    b.source === "leave" ? (hhmm(b.start) === "00:00" && hhmm(b.end) === "23:59" ? w.busyLineLeaveDay : w.busyLineLeave) : b.source ? w.busyLineBooking : w.busyLine;
  const startMin = time, endMin = startMin + minutes;
  const toMin = (iso: string) => { const [a, b] = hhmm(iso).split(":").map(Number) as [number, number]; return a * 60 + b; };
  const clash = busy.filter(b => toMin(b.start) < endMin && toMin(b.end) > startMin);
  const lengthField = (
    <div className="field-block">
      <label className="label" htmlFor="iv-length">{w.length}</label>
      <select id="iv-length" className="field" value={minutes} onChange={e => setMinutes(Number(e.target.value))}>
        {durations.map(d => <option key={d} value={d}>{d < 60 ? format(w.minutes, { n: d }) : d % 60 === 0 ? format(w.hoursOnly, { h: d / 60 }) : format(w.hoursMinutes, { h: Math.floor(d / 60), m: d % 60 })}</option>)}
      </select>
    </div>
  );
  if (link) {
    return (
      <div className="stack" role="status">
        <p>{format(w.linkNoMail, { name: candidate.name })}</p>
        <div className="link-row">
          <input className="field" readOnly value={link} aria-label={w.linkLabel} onFocus={e => e.currentTarget.select()} />
          <button type="button" className="button quiet" onClick={() => { void navigator.clipboard?.writeText(link).then(() => toast(w.linkCopied), () => toast(w.linkCopied)); }}><Copy />{w.linkCopy}</button>
        </div>
        <div className="form-actions"><button type="button" className="button" onClick={onDone}>{w.linkDone}</button></div>
      </div>
    );
  }
  return (
    <form className="stack" onSubmit={e => {
      e.preventDefault();
      const refused = ["iv-from", "iv-to", "iv-day"].find(key => dates.of(key));
      if (refused) {
        document.getElementById(refused)?.focus();
        return;
      }
      const data = new FormData(e.currentTarget);
      setError(null);
      const place = String(data.get("place") ?? ""), note = String(data.get("note") ?? "");
      start(async () => {
        if (mode === "link") {
          if (!firstDay || !lastDay) return;
          const r = await sendInterviewLink(candidate.id, { people: chosen, minutes, firstDay, lastDay, dayStart, dayEnd, place, note, skipLunch });
          if (!r.ok) return setError(failed(t.errors, r));
          if (r.value.status === "sent") {
            onDone();
            toast({ id: `interview-${candidate.id}`, text: format(w.linkSent, { name: candidate.name }), sent: true });
          } else setLink(r.value.link);
          return;
        }
        if (!day) return;
        const r = await scheduleInterview(candidate.id, { day, time: hhmmOf(time), minutes, people: chosen, place, note, tell });
        if (!r.ok) return setError(failed(t.errors, r));
        onDone();
        if (r.value.status === "sent") toast({ id: `interview-${candidate.id}`, text: format(w.invited, { name: candidate.name }), sent: true });
        else toast(r.value.status === "none" ? w.noMail : w.saved);
      });
    }} onInput={onTyped}>
      <Segmented label={w.how} options={[{ value: "link", label: format(w.theyChoose, { name: candidate.name.split(/\s+/u)[0] ?? candidate.name }) }, { value: "time", label: w.iChoose }]} value={mode} onChange={v => { setMode(v); setError(null); }} />
      <fieldset className="choices">
        <legend className="label">{w.people}</legend>
        <ul className="pick-list">
          {interview.people.map(p => (
            <li key={p.id}>
              <label className="check">
                <input type="checkbox" checked={people.has(p.id)} onChange={e => setPeople(s => { const n = new Set(s); if (e.target.checked) n.add(p.id); else n.delete(p.id); return n; })} />
                <span>{p.name}</span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      {mode === "link" ? (
        <>
          <p className="hint">{w.linkHint}</p>
          <div className="three">
            <div className="field-block iv-day">
              <WatchedDateField id="iv-from" onProblem={dates.watch("iv-from")} label={w.fromDay} value={firstDay} onChange={d => { setFirstDay(d); if (d && lastDay && lastDay < d) setLastDay(addIsoDays(d, 7)); onTyped(); }} today={interview.today} min={interview.today} max={last} required labels={t.date} />
            </div>
            <div className="field-block iv-day">
              <WatchedDateField id="iv-to" onProblem={dates.watch("iv-to")} label={w.toDay} value={lastDay} onChange={d => { setLastDay(d); onTyped(); }} today={interview.today} min={firstDay ?? interview.today} max={firstDay ? addIsoDays(firstDay, 21) : last} required labels={t.date} />
            </div>
            {lengthField}
          </div>
          <div className="three">
            <div className="field-block">
              <label className="label" htmlFor="iv-hours-from">{format(w.hoursFrom, { zone: interview.zone })}</label>
              <TimeSelect id="iv-hours-from" value={dayStart} onChange={v => { setDayStart(v); if (dayEnd <= v) setDayEnd(Math.min(24 * 60, v + 60)); }} step={30} min={6 * 60} max={21 * 60} />
            </div>
            <div className="field-block">
              <label className="label" htmlFor="iv-hours-to">{w.hoursTo}</label>
              <TimeSelect id="iv-hours-to" value={dayEnd} onChange={setDayEnd} step={30} min={dayStart + 30} max={22 * 60} end />
            </div>
          </div>
          <label className="check">
            <input type="checkbox" checked={skipLunch} onChange={e => setSkipLunch(e.target.checked)} />
            <span>{w.skipLunch}</span>
          </label>
        </>
      ) : (
        <div className="three">
          <div className="field-block iv-day">
            <WatchedDateField id="iv-day" onProblem={dates.watch("iv-day")} label={w.day} value={day} onChange={d => { setDay(d); onTyped(); }} today={interview.today} min={interview.today} max={last} required labels={t.date} />
          </div>
          <div className="field-block">
            <label className="label" htmlFor="iv-time">{format(w.time, { zone: interview.zone })}</label>
            <TimeSelect id="iv-time" value={time} onChange={setTime} step={15} min={firstStart} max={lastStart + 15} />
          </div>
          {lengthField}
        </div>
      )}
      {mode === "time" && day && busy.length > 0 && (
        <div className={`busy${clash.length ? " clash" : ""}`} role="status">
          <p className="label">{clash.length ? w.clash : w.busy}</p>
          <ul className="plain-list">
            {busy.map((b, i) => <li key={i}>{format(busyLine(b), { name: names.get(b.member) ?? "", from: hhmm(b.start), to: hhmm(b.end) })}</li>)}
          </ul>
        </div>
      )}
      {mode === "time" && day && busy.length === 0 && chosen.length > 0 && <p className="hint">{w.free}</p>}
      <div className="field-block">
        <label className="label" htmlFor="iv-place">{w.place} <span className="optional">{t.apply.optional}</span></label>
        <input id="iv-place" name="place" className="field" maxLength={limits.interviewPlace} placeholder={w.placePlaceholder} />
      </div>
      <div className="field-block">
        <label className="label" htmlFor="iv-note">{w.note} <span className="optional">{t.apply.optional}</span></label>
        <textarea id="iv-note" name="note" className="field" rows={3} maxLength={limits.interviewNote} placeholder={w.notePlaceholder} />
      </div>
      {mode === "time" && (
        <label className="check">
          <input type="checkbox" checked={tell} onChange={e => setTell(e.target.checked)} />
          <span>{format(w.tell, { name: candidate.name })}</span>
        </label>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="form-actions">
        {/* The button says who meets them: nobody is on it without being chosen. */}
        {mode === "link"
          ? <button type="submit" className="button" disabled={pending || !firstDay || !lastDay || chosen.length === 0}><Send />{chosen.length ? format(w.sendLinkTo, { names: firstNames }) : w.sendLink}</button>
          : <button type="submit" className="button" disabled={pending || !day || chosen.length === 0}><Calendar />{chosen.length ? format(tell ? w.sendTo : w.saveFor, { names: firstNames }) : tell ? w.send : w.save}</button>}
        <button type="button" className="button quiet" onClick={onDone}>{t.common.cancel}</button>
      </div>
    </form>
  );
}

// Proposing someone for another job: a new application there, with their
// details and CV; the history of both says so.
function ConsiderForm({ candidateId, jobs, t, onDone }: { candidateId: string; jobs: { id: string; title: string }[]; t: ActionWords; onDone: () => void }) {
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [job, setJob] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <form className="stack" onSubmit={e => {
      e.preventDefault();
      start(async () => {
        const r = await considerFor(candidateId, job);
        if (!r.ok) return setError(failed(t.errors, r));
        onDone();
        toast(format(t.candidate.considered, { job: jobs.find(j => j.id === job)?.title ?? "" }));
        router.push(`/chest/candidates/${r.value.id}`);
      });
    }}>
      <div className="field-block">
        <label className="label" htmlFor="consider-job">{t.candidate.considerJob}</label>
        <select id="consider-job" className="field" required value={job} onChange={e => setJob(e.target.value)}>
          <option value="">…</option>
          {jobs.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
        </select>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="form-actions">
        <button type="submit" className="button" disabled={pending || !job}><People />{t.candidate.considerSend}</button>
        <button type="button" className="button quiet" onClick={onDone}>{t.common.cancel}</button>
      </div>
    </form>
  );
}

// ---- The conversation ----------------------------------------------------------

type ShownMessage = Message & { authorName: string; when: string };

export function Conversation({ messages, candidate, locale, t }: { messages: ShownMessage[]; candidate: { name: string; email: string }; locale: string; t: { write: Catalogue["write"] } }) {
  const w = t.write;
  if (messages.length === 0) return <p className="muted">{format(w.none, { name: candidate.name })}</p>;
  const state = (m: ShownMessage) => m.direction === "in" ? null
    : m.status === "waiting" ? <StatusBadge tone="wait" size="s" label={w.status.waiting} />
    : m.status === "sent" ? null
    : m.status === "none" ? <StatusBadge size="s" label={w.status.none} />
    : m.status === "cancelled" ? <StatusBadge size="s" label={w.status.cancelled} />
    : m.status === "bounced" ? <StatusBadge tone="danger" size="s" label={w.status.bounced} />
    : <StatusBadge tone="danger" size="s" label={w.status.failed} />;
  return (
    <ol className="mails">
      {messages.map(m => (
        <li key={m.id} className={`mail ${m.direction}`}>
          <details open={m === messages.at(-1)}>
            <summary>
              <span className="mail-who">{m.direction === "in" ? (m.fromName || m.fromAddress || candidate.name) : m.authorName}</span>
              <span className="mail-subject">{m.subject || w.noSubject}</span>
              <span className="muted small">{m.when}</span>
              {state(m)}
            </summary>
            <p className="pre mail-body">{m.body}</p>
            {(m.attachments.length > 0 || (m.direction === "in" && m.hasOriginal)) && (
              <ul className="mail-files">
                {m.attachments.map((a, i) => <li key={i}><a href={`/chest/messages/${m.id}/files/${i}`} download><Download />{a.name}</a> <span className="muted small">{fileSize(a.size, locale)}</span></li>)}
                {m.direction === "in" && m.hasOriginal && <li><a href={`/chest/messages/${m.id}/files/original`} download><Download />{w.original}</a></li>}
              </ul>
            )}
            {m.direction === "in" && m.authenticated === false && <p className="hint">{w.unverified}</p>}
            {m.hasCalendar && <p className="hint">{w.withInvite}</p>}
          </details>
        </li>
      ))}
    </ol>
  );
}

// ---- Interviews -------------------------------------------------------------

export function Interviews({ list, links = [], manage, t }: { list: { id: string; when: string; past: boolean; place: string; people: string; cancelled: boolean; ics: boolean }[]; links?: { id: string; from: string; to: string; people: string }[]; manage: boolean; t: { interview: Catalogue["interview"]; errors: Errors; common: Catalogue["common"] } }) {
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [tell, setTell] = useState(true);
  const w = t.interview;
  if (list.length === 0 && links.length === 0) return <p className="muted">{w.none}</p>;
  return (
    <>
      {links.length > 0 && (
        <ul className="meetings">
          {links.map(l => (
            <li key={l.id} className="waiting-link">
              <span className="meet-when">{format(w.waiting, { from: l.from, to: l.to })}</span>
              {l.people && <span className="muted small">{l.people}</span>}
              {manage && (
                <span className="meet-actions">
                  <button type="button" className="button link small" disabled={pending} onClick={() => start(async () => {
                    const r = await cancelInterviewLink(l.id);
                    if (!r.ok) return void toast({ text: failed(t.errors, r), tone: "error" });
                    toast(w.linkStopped);
                    router.refresh();
                  })}><Close />{w.stopLink}</button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      <ul className="meetings">
        {list.map(i => (
          <li key={i.id} className={i.cancelled ? "cancelled" : i.past ? "past" : undefined}>
            <span className="meet-when">{i.when}</span>
            <span className="muted small">{[i.people, i.place].filter(Boolean).join(" · ")}</span>
            {i.cancelled ? <StatusBadge size="s" label={w.cancelled} /> : (
              <span className="meet-actions">
                {i.ics && <a className="button link small" href={`/chest/interviews/${i.id}/ics`} download>{w.addToCalendar}</a>}
                {manage && !i.past && <button type="button" className="button link small" onClick={() => setCancelling(i.id)}><Close />{w.cancel}</button>}
              </span>
            )}
          </li>
        ))}
      </ul>
      <Confirm
        open={cancelling !== null}
        title={w.cancelTitle}
        body={w.cancelBody}
        confirmLabel={w.cancelConfirm}
        cancelLabel={t.common.cancel}
        busy={pending}
        onCancel={() => setCancelling(null)}
        onConfirm={() => {
          const id = cancelling;
          setCancelling(null);
          if (id) start(async () => {
            const r = await cancelInterview(id, tell);
            if (!r.ok) return void toast({ text: failed(t.errors, r), tone: "error" });
            toast(r.value.status === "sent" ? { id: `interview-${id}`, text: w.cancelledSent, sent: true } : w.cancelledToast);
          });
        }}
      >
        <label className="check"><input type="checkbox" checked={tell} onChange={e => setTell(e.target.checked)} /><span>{w.tellCancel}</span></label>
      </Confirm>
    </>
  );
}

function AskForm({ candidateId, askable, locale, t, onDone }: { candidateId: string; askable: { id: string; name: string; asked: boolean }[]; locale: string; t: ActionWords; onDone: () => void }) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const w = t.candidate;
  if (askable.length === 0) return <p className="muted">{w.nobodyToAsk}</p>;
  return (
    <form className="stack" onSubmit={e => {
      e.preventDefault();
      start(async () => {
        const r = await askFeedback(candidateId, [...chosen]);
        if (!r.ok) return void toast({ text: failed(t.errors, r), tone: "error" });
        onDone();
        toast(plural(w.asked, r.value.count, locale));
      });
    }}>
      <p className="hint">{w.askHint}</p>
      <ul className="pick-list">
        {askable.map(p => (
          <li key={p.id}>
            {p.asked ? (
              <span className="asked-row">
                <span>{p.name}</span>
                <button type="button" className="button link small" disabled={pending} onClick={() => start(async () => { const r = await cancelAsk(candidateId, p.id); if (!r.ok) toast({ text: failed(t.errors, r), tone: "error" }); })}>{format(w.stopAsking, { name: p.name })}</button>
              </span>
            ) : (
              <label className="check">
                <input type="checkbox" checked={chosen.has(p.id)} onChange={e => setChosen(s => { const n = new Set(s); if (e.target.checked) n.add(p.id); else n.delete(p.id); return n; })} />
                <span>{p.name}</span>
              </label>
            )}
          </li>
        ))}
      </ul>
      <div className="form-actions">
        <button type="submit" className="button" disabled={pending || chosen.size === 0}><Bell />{w.askSend}</button>
        <button type="button" className="button quiet" onClick={onDone}>{t.common.cancel}</button>
      </div>
    </form>
  );
}

function EditForm({ candidate, t, onDone, onTyped }: { candidate: { id: string; name: string; email: string; phone: string; link: string; language: Language }; t: ActionWords; onDone: () => void; onTyped: () => void }) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <form className="stack" onInput={onTyped} onSubmit={e => {
      e.preventDefault();
      const data = new FormData(e.currentTarget);
      const text = (k: string) => String(data.get(k) ?? "");
      start(async () => {
        const r = await editCandidate(candidate.id, { name: text("name"), email: text("email"), phone: text("phone"), link: text("link"), language: text("language") });
        if (!r.ok) return setError(failed(t.errors, r));
        onDone();
        toast(t.common.saved);
      });
    }}>
      <div className="field-block"><label className="label" htmlFor="edit-name">{t.apply.name}</label><input id="edit-name" name="name" className="field" required maxLength={limits.name} defaultValue={candidate.name} /></div>
      <div className="field-block"><label className="label" htmlFor="edit-email">{t.apply.email}</label><input id="edit-email" name="email" type="email" className="field" required maxLength={limits.email} defaultValue={candidate.email} /></div>
      <div className="field-block"><label className="label" htmlFor="edit-phone">{t.apply.phone}</label><input id="edit-phone" name="phone" type="tel" className="field" maxLength={limits.phone} defaultValue={candidate.phone} /></div>
      <div className="field-block"><label className="label" htmlFor="edit-link">{t.apply.link}</label><input id="edit-link" name="link" className="field" maxLength={limits.link} defaultValue={candidate.link} /></div>
      <div className="field-block">
        <label className="label" htmlFor="edit-language">{t.candidate.language}</label>
        <select id="edit-language" name="language" className="field" defaultValue={candidate.language}>
          {languages.map(l => <option key={l} value={l}>{languageNames[l]}</option>)}
        </select>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="form-actions">
        <button type="submit" className="button" disabled={pending}>{t.common.save}</button>
        <button type="button" className="button quiet" onClick={onDone}>{t.common.cancel}</button>
      </div>
    </form>
  );
}

// ---- Feedback --------------------------------------------------------------

type FeedbackWords = { candidate: Catalogue["candidate"]; errors: Errors };

export function FeedbackForm({ candidateId, mine, t }: { candidateId: string; mine: Feedback | null; t: FeedbackWords }) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const [rating, setRating] = useState<number>(mine?.rating ?? 0);
  const [recommendation, setRecommendation] = useState<string>(mine?.recommendation ?? "");
  const [error, setError] = useState<string | null>(null);
  const w = t.candidate;
  const ratingWords = [w.ratings.r1, w.ratings.r2, w.ratings.r3, w.ratings.r4];
  return (
    <form className="stack feedback-form" onSubmit={e => {
      e.preventDefault();
      const data = new FormData(e.currentTarget);
      if (!rating || !recommendation) return setError(t.errors.empty);
      setError(null);
      start(async () => {
        const r = await giveFeedback(candidateId, { rating, recommendation, strengths: String(data.get("strengths") ?? ""), concerns: String(data.get("concerns") ?? "") });
        if (!r.ok) return setError(failed(t.errors, r));
        toast(w.feedbackSaved);
      });
    }}>
      <fieldset className="choices">
        <legend className="label">{w.rating}</legend>
        <div className="scale">
          {ratingWords.map((word, i) => (
            <label key={i} className={`scale-step s${i + 1}${rating === i + 1 ? " on" : ""}`}>
              <input type="radio" name="rating" value={i + 1} checked={rating === i + 1} onChange={() => setRating(i + 1)} required />
              <span className="scale-n">{i + 1}</span>
              <span className="scale-word">{word}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="two">
        <div className="field-block">
          <label className="label" htmlFor={`strengths-${candidateId}`}>{w.strengths}</label>
          <textarea id={`strengths-${candidateId}`} name="strengths" className="field" rows={4} maxLength={limits.feedbackText} defaultValue={mine?.strengths ?? ""} />
        </div>
        <div className="field-block">
          <label className="label" htmlFor={`concerns-${candidateId}`}>{w.concerns}</label>
          <textarea id={`concerns-${candidateId}`} name="concerns" className="field" rows={4} maxLength={limits.feedbackText} defaultValue={mine?.concerns ?? ""} />
        </div>
      </div>
      <p className="hint">{w.feedbackHint}</p>
      <fieldset className="choices">
        <legend className="label">{w.recommendation}</legend>
        <div className="reco">
          {recommendations.map(r => (
            <label key={r} className={`pill reco-${r}${recommendation === r ? " on" : ""}`}>
              <input type="radio" name="recommendation" value={r} checked={recommendation === r} onChange={() => setRecommendation(r)} required />
              <span>{w.recommendations[r]}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="form-actions">
        <button type="submit" className="button" disabled={pending}>{mine ? w.updateFeedback : w.sendFeedback}</button>
      </div>
    </form>
  );
}

export function FeedbackList({ mine, others, hidden, locale, t }: { mine: (Feedback & { authorName: string }) | null; others: (Feedback & { authorName: string })[]; hidden: number; locale: string; t: { candidate: Catalogue["candidate"] } }) {
  const w = t.candidate;
  const all = [...(mine ? [mine] : []), ...others];
  const ratingWords = [w.ratings.r1, w.ratings.r2, w.ratings.r3, w.ratings.r4];
  const average = all.length > 0 ? all.reduce((sum, f) => sum + f.rating, 0) / all.length : null;
  if (hidden > 0) return <p className="hidden-feedback">{plural(w.hidden, hidden, locale)}</p>;
  if (all.length === 0) return <p className="muted">{w.noFeedback}</p>;
  return (
    <>
      {average !== null && all.length > 1 && <p className="average">{format(w.average, { rating: new Intl.NumberFormat(intl(locale), { maximumFractionDigits: 1 }).format(average) })}</p>}
      <ul className="feedback-list">
        {all.map(f => (
          <li key={f.id} className="feedback-card">
            <div className="feedback-head">
              <strong>{f.authorName}</strong>
              <span className={`score s${f.rating}`}>{f.rating}/4 · {ratingWords[f.rating - 1]}</span>
              <span className={`reco-tag reco-${f.recommendation}`}>{w.recommendations[f.recommendation]}</span>
            </div>
            {f.strengths && <p><span className="fb-label">{w.strengths}</span> <span className="pre">{f.strengths}</span></p>}
            {f.concerns && <p><span className="fb-label">{w.concerns}</span> <span className="pre">{f.concerns}</span></p>}
          </li>
        ))}
      </ul>
    </>
  );
}

// ---- Notes -----------------------------------------------------------------

export function Notes({ candidateId, notes, canWrite, t }: { candidateId: string; notes: { id: string; authorName: string; body: string; when: string; mine: boolean }[]; canWrite: boolean; t: FeedbackWords }) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const [text, setText] = useState("");
  const w = t.candidate;
  return (
    <div className="notes">
      {notes.length === 0 ? <p className="muted">{w.noNotes}</p> : (
        <ul className="note-list">
          {notes.map(n => (
            <li key={n.id}>
              <div className="note-head"><strong>{n.authorName}</strong><span className="muted small">{n.when}</span>
                {n.mine && canWrite && <button type="button" className="button link small" onClick={() => start(async () => { const r = await removeNote(n.id); if (!r.ok) toast({ text: failed(t.errors, r), tone: "error" }); })}><Bin />{w.removeNote}</button>}
              </div>
              <p className="pre">{n.body}</p>
            </li>
          ))}
        </ul>
      )}
      {canWrite && (
        <form className="note-form" onSubmit={e => {
          e.preventDefault();
          const body = text.trim();
          if (!body) return;
          start(async () => {
            const r = await addNote(candidateId, body);
            if (!r.ok) return void toast({ text: failed(t.errors, r), tone: "error" });
            setText("");
          });
        }}>
          <label className="visually-hidden" htmlFor="note">{w.notes}</label>
          <textarea id="note" className="field" rows={3} maxLength={limits.note} value={text} onChange={e => setText(e.target.value)} placeholder={w.notePlaceholder} />
          <div className="form-actions"><button type="submit" className="button quiet small" disabled={pending || !text.trim()}>{w.addNote}</button></div>
        </form>
      )}
    </div>
  );
}
