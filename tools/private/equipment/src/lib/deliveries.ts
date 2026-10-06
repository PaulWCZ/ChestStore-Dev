import { chest } from "@argentic/chest-sdk/chest";
import * as events from "@argentic/chest-sdk/events";
import * as schedules from "@argentic/chest-sdk/schedules";
import { AppError, log } from "@argentic/chest-app";
import { db } from "./db.ts";
import { leaving, leavingCancelled } from "./departures.ts";
import { connected, refresh } from "./intune.ts";
import { forgetSeen, handlers, seen } from "./lifecycle.ts";
import { people } from "./people.ts";
import { forgetReturned, publishReturned } from "./returned.ts";
import * as tell from "./tell.ts";
import { weekly } from "./weekly.ts";

// What the Chest posts by itself, signed, at least once (src/app.tsx routes
// it; never under /chest, never behind a member; the body read by the
// SDK's handle() only). A handler that throws makes the Chest send it
// again: each is idempotent, and the ids already handled are kept in the
// database (seen), not in memory — the tool sleeps.

// The members' lifecycle ("receives": ["member.*"], lib/lifecycle.ts), and
// what People tells Equipment (Proposal (studio): events between tools —
// departures, chest.proposals.json "receives"). An event of another shape
// changes nothing.
export async function onEvent(request: Request): Promise<Response> {
  const sql = db();
  return new Response(null, {
    status: await events.handle(request, handlers(sql), {
      seen: seen(sql),
      tools: {
        "people.leaving": async e => {
          const d = await leaving(sql, e, chest.today());
          if (!d) return;
          const who = (await people([d.memberId])).get(d.memberId);
          await tell.leaving({ id: d.memberId, name: who?.status === "member" ? who.name : "" }, d.lastDay, d.count);
        },
        "people.leaving_cancelled": async e => {
          const member = await leavingCancelled(sql, e);
          if (member) await tell.stays(member);
        },
      },
    }),
  });
}

// The runs of chest.json's "schedules", read on the Chest's clock:
// - weekly (Monday 07:50): the managers' word on what ends soon
//   (lib/weekly.ts); the delivered ids of more than 30 days forgotten;
// - intune (05:40): what Microsoft Intune says of the devices, when an
//   administrator connected it (nothing otherwise). A read Intune refused
//   is kept in the reads (the import page says why) and not tried again
//   before the next night;
// - returns (every quarter of an hour): what is back from a leaving person
//   and the Chest could not take yet is told to People again
//   (equipment.returned, lib/returned.ts); what was told a day ago, or
//   refused for a week, is forgotten.
export async function onSchedule(request: Request): Promise<Response> {
  const sql = db();
  return new Response(null, {
    status: await schedules.handle(request, {
      weekly: async run => {
        await weekly(sql, run);
        const forgotten = await forgetSeen(sql);
        log.info("weekly run", { run: run.id, attempt: run.attempt, forgotten });
      },
      returns: async () => {
        await publishReturned(sql);
        await forgetReturned(sql);
      },
      intune: async run => {
        if (!connected()) return;
        try {
          await refresh(sql, "schedule");
        } catch (error) {
          if (!(error instanceof AppError)) throw error;
          log.warn("intune read refused", { run: run.id, code: error.code });
        }
      },
    }, { seen: seen(sql) }),
  });
}
