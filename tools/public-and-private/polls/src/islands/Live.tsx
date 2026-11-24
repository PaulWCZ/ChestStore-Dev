import { useEffect } from "react";
import { refresh, useLive } from "@argentic/chest-app/client";

// Pages others change, read again when the Chest says they changed — never
// on a timer (SDK 0.7.0's realtime: the channels and feeds of chest.json).
// The Chest holds the page's connection: Polls sleeps while a page stays
// open and wakes only when someone writes. refresh() keeps what is typed,
// the scroll and each island's state.

// The home page: a poll sent, closed, reopened or deleted ("polls" channel,
// the polls table's feed), and an answer to one of the reader's own polls
// (published on their own channel "mine:<member>", lib/live.ts).
export function LiveHome({ member }: { member: string }) {
  useLive("polls", ["polls"]);
  useLive(`mine:${member}`, ["poll.answered"]);
  return null;
}

// A poll's page: its words, status or final date (the polls table's feed,
// on "polls": a table has one feed), its comments and replies (their feeds,
// on "poll:<id>"), an answer from a member or a guest (published there,
// lib/live.ts). focus: the reader has it on screen — a comment's author
// does not notify an organiser who is watching (lib/live.ts). And once, at
// its closing time on the browser's clock, the page is read again: the
// poll then shows as closed (closing is evaluated on read).
export function LivePoll({ id, closesAt }: { id: string; closesAt: string | null }) {
  useLive("polls", ["polls"]);
  useLive(`poll:${id}`, ["comments", "replies", "poll.answered"], { focus: true });
  useEffect(() => {
    if (!closesAt) return;
    const wait = new Date(closesAt).getTime() - Date.now() + 1000;
    // setTimeout holds 24.8 days at most; a poll closing later is read
    // again by its other events (and the pass that closes it).
    if (wait <= 0 || wait > 2_000_000_000) return;
    const timer = setTimeout(() => void refresh(), wait);
    return () => clearTimeout(timer);
  }, [closesAt]);
  return null;
}
