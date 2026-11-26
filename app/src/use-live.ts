import { useEffect } from "react";
import { follow, readWith, shared } from "./live.ts";
import { refresh } from "./runtime.tsx";

readWith(refresh);

// useLive(channel, names, { focus? }): this island's page read again when
// the Chest says what it shows changed (live.ts says when). channel: one
// of chest.json's "realtime" channels ("notes", "board:12"); names: a
// feed's table ("cards": its inserts, updates and deletes) or an event the
// tool publishes ("board.renamed"); focus: the member has this channel on
// screen (realtime.online's watching: notify those who are not).
export function useLive(channel: string, names: readonly string[], options: { focus?: boolean } = {}): void {
  const key = names.join(" ");
  const focus = options.focus === true;
  useEffect(() => follow(shared(), channel, key ? key.split(" ") : [], { focus }), [channel, key, focus]);
}
