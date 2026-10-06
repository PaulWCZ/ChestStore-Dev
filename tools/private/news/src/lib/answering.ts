import type { Member } from "@argentic/chest-sdk/member";
import { syncEvent } from "./agenda.ts";
import type { Sql } from "./db.ts";
import { id } from "../shared/model.ts";
import { answer } from "./posts.ts";
import { promoted } from "./tell.ts";
import { chestZone } from "./zone.ts";

// Answering an event, from its page or from a link of an email: the
// answer, then what follows it — a seat freed goes to the first waiting,
// who is told; the Chest's calendar follows (Proposal (studio)).
// before: the answer the person had (to offer Undo).
export async function answerEvent(sql: Sql, actor: Member | null, postId: string, value: "yes" | "no" | null): Promise<{ answer: "yes" | "no" | "wait" | null; before: "yes" | "no" | "wait" | null }> {
  const key = id(postId);
  const [had] = actor ? await sql<{ answer: "yes" | "no" | "wait" }[]>`select answer from rsvps where post_id = ${key} and member = ${actor.id}` : [];
  const done = await answer(sql, actor, postId, value, { zone: chestZone() });
  if (done.promoted) {
    const [row] = await sql<{ title: string }[]>`select title from posts where id = ${postId}`;
    await promoted(done.promoted, { id: postId, title: row?.title ?? "" });
  }
  await syncEvent(sql, postId);
  return { answer: done.answer, before: had?.answer ?? null };
}
