import { useLive } from "@argentic/chest-app/client";

// The team's pages follow what others write, through the Chest's realtime
// (SDK 0.7.0; chest.json's "realtime"): the Chest holds the connection and
// tells each committed row of the feeds — a candidate applied or moved, a
// note, a feedback, an email, an interview, a job changed — so the tool
// sleeps while a page stays open, and the page is read again (refresh():
// what is typed, the scroll and the islands' state stay; a page that did
// not change is a 304) only when something changed: a burst once, a tab
// in the background once when it comes back, again after a reconnection
// that missed too much. No timer.
// Each job the page shows has its channel, "job:<id>", where its rows are
// fed with their id alone. Only who sees the job joins it (the table
// job_live, lib/live.ts: a recruiter, an interviewer on that job); ticket
// is the mark of the reader's row: when it went (taken off the job, their
// role changed) the Chest took them out and the page read itself again —
// still allowed, a new mark, and the channel is joined again.
const events = ["jobs", "stages", "candidates", "notes", "feedback", "messages", "interviews", "interview_requests"];

function Follow({ id }: { id: string }) {
  useLive(`job:${id}`, events);
  return null;
}

export function LiveTeam({ jobs }: { jobs: { id: string; ticket: string }[] }) {
  return <>{jobs.map(j => <Follow key={`${j.id} ${j.ticket}`} id={j.id} />)}</>;
}
