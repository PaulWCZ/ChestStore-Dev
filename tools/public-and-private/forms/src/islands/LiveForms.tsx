import { useLive } from "@argentic/chest-app/client";

// A page others change (new answers, a form published, shared or closed)
// follows the Chest's realtime (SDK 0.7.0), never a timer, and is read
// again at each change (useLive: what is typed and the islands' state
// stay; a read whose version did not change is a 304). The tool sleeps
// while the page stays open. A visitor's public form is not live: realtime
// is for members.
// - forms: each form the page shows and its reader may open, on
//   "form:<id>" — the feeds of its row and its answers, an id alone. Only
//   who may open the form joins it (the table form_live, lib/live.ts):
//   ticket is the mark of the reader's row; when it went (unshared, their
//   role changed) the Chest took them out and the page read itself again
//   — still allowed, a new mark, and the channel is joined again.
// - lanes: "team", "managers", "mine:<member>", where the tool says, with
//   no id, that the reader's home changed (lib/live.ts).
export function LiveForms({ forms, lanes }: { forms: { id: string; ticket: string }[]; lanes: string[] }) {
  return (
    <>
      {forms.map(f => <FollowForm key={`${f.id} ${f.ticket}`} id={f.id} />)}
      {lanes.map(l => <FollowLane key={l} channel={l} />)}
    </>
  );
}

function FollowForm({ id }: { id: string }) {
  useLive(`form:${id}`, ["answers", "forms"], { focus: true });
  return null;
}

function FollowLane({ channel }: { channel: string }) {
  useLive(channel, ["forms.changed"]);
  return null;
}
