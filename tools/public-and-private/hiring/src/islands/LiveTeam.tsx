import { useLive } from "@argentic/chest-app/client";

// The team's pages follow what others write, through the Chest's realtime
// (SDK 0.7.0; chest.json's "realtime"): the Chest holds the connection and
// tells each committed row of the feeds — a candidate applied or moved, a
// note, a feedback, an email, an interview, a job changed — so the tool
// sleeps while a page stays open, and the page is read again (refresh():
// what is typed, the scroll and the islands' state stay; a page that did
// not change is a 304) only when something changed: a burst once, a tab
// in the background once when it comes back, again after a reconnection
// that missed too much. No timer. The feeds carry ids only: what a member
// may see (an interviewer: the jobs they are on) is the page's read to
// decide, never the event's.
const events = ["jobs", "stages", "candidates", "notes", "feedback", "messages", "interviews", "interview_requests"];

export function LiveTeam() {
  useLive("team", events);
  return null;
}
