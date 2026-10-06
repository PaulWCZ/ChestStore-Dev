import type { Member } from "@argentic/chest-sdk/member";
import * as events from "@argentic/chest-sdk/events";
import * as schedules from "@argentic/chest-sdk/schedules";
import { log } from "@argentic/chest-app";
import { AppError } from "@argentic/chest-app";
import { checkToken, isChoice } from "./lib/answer-links.ts";
import { answerEvent } from "./lib/answering.ts";
import { db } from "./lib/db.ts";
import { startDigest } from "./lib/digest.ts";
import { handlers, seen } from "./lib/lifecycle.ts";
import { pass } from "./lib/tell.ts";
import { id } from "./lib/input.ts";

// What src/app.tsx answers at the addresses the Chest calls by itself, and
// at the one-tap links of an email — plain functions of a Request, so the
// tests call them as the server does.

// POST /chest-events: the members' lifecycle and the groups' changes
// ("receives"), signed by the Chest, at least once (a delivery already
// handled is dropped: `seen`). Never under /chest, never behind a session;
// the body is read by handle() only.
export async function chestEvents(request: Request): Promise<Response> {
  const sql = db();
  return new Response(null, { status: await events.handle(request, handlers(sql), { seen: seen(sql) }) });
}

// POST /chest-schedules: the runs of chest.json's "schedules", signed.
// Every 15 minutes, "publish": what is due is told (scheduled Important
// posts reach the bell on time, a telling or a digest stopped by the
// hourly quota goes on), and what was deleted long ago is purged. On
// Monday at 08:30 (the Chest's time zone), "digest": each person's week in
// their bell. A run that fails comes again with the same id: both are
// idempotent. Without schedules, the publish pass runs when someone opens
// the front page (catchUp); there is no digest.
export async function chestSchedules(request: Request): Promise<Response> {
  const sql = db();
  return new Response(null, {
    status: await schedules.handle(request, {
      publish: async () => {
        const done = await pass(sql);
        log.info("publish pass", { told: done.told.length, waiting: done.waiting.length });
      },
      digest: async run => {
        await startDigest(sql, run);
        log.info("digest started", { run: run.id });
      },
    }, { seen: seen(sql) }),
  });
}

// GET /chest/posts/<id>/answer?a=yes|no&t=…: "I'm coming" / "Not coming"
// from an email, in one tap (src/lib/answer-links.ts). The person is
// whoever the Chest says opened the link (actor); the token proves News
// wrote this button for them and this event. The answer is given, then the
// post opens and says it, with Undo ("answered", "was"). A link that is
// not theirs, or an event already over, changes nothing and the post says
// why. Nothing else can be done at this address.
export async function answerLink(request: Request, actor: Member | null, postIdText: string): Promise<Response> {
  let postId: string;
  try {
    postId = id(postIdText);
  } catch {
    return new Response(null, { status: 404 });
  }
  const url = new URL(request.url);
  const choice = url.searchParams.get("a");
  const back = (query: string) => new Response(null, { status: 303, headers: { Location: `/chest/posts/${postId}?${query}`, "Cache-Control": "no-store" } });
  if (!actor || !isChoice(choice) || !(await checkToken(db(), postId, choice, actor.id, url.searchParams.get("t")))) return back("answered=invalid");
  try {
    const done = await answerEvent(db(), actor, postId, choice);
    return back(`answered=${done.answer ?? "none"}&was=${done.before ?? "none"}`);
  } catch (error) {
    if (!(error instanceof AppError)) throw error;
    if (error.code === "not_found") return new Response(null, { status: 404 });
    return back(error.code === "closed" ? "answered=closed" : "answered=invalid");
  }
}
