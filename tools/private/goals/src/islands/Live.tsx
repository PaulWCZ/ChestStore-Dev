import { useLive } from "@argentic/chest-app/client";

// A page others change, left open (the company's goals, a team's, an
// objective, my goals), follows the Chest's realtime, never a timer: it
// joins "objective:everyone", where every write of the tables objectives,
// key_results, check_ins and comments that every member sees arrives —
// their id only (chest.json "realtime" feeds) —, and "objective:<id>" of
// each confidential objective it shows, joined only by who may see it
// (lib/live.ts). The page reads the rest itself, as its reader may. At
// each event the package reads the page again — a 304 when its version
// (src/lib/stamp.ts) did not move —, keeping what is typed and the
// islands' state; the Chest holds the connection, so the tool sleeps while
// the tab stays open. ticket: the mark of the reader's row; when it went
// (the objective's people or the reader's groups changed) the Chest took
// them out and the page read itself again — still allowed, a new mark,
// and the channel is joined again.
function Follow({ channel, names }: { channel: string; names: string[] }) {
  useLive(channel, names);
  return null;
}

export function Live({ follow, names }: { follow: { channel: string; ticket: string }[]; names: string[] }) {
  return <>{follow.map(f => <Follow key={`${f.channel} ${f.ticket}`} channel={f.channel} names={names} />)}</>;
}
