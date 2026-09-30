import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import type { LeaveRequest } from "../lib/requests.ts";
import * as share from "../lib/share.ts";

// What Leave tells the other tools (Proposal (studio): events between tools).
let chest: FakeChest;
before(async () => {
  chest = await fakeChest({ tool: "leave", emits: ["leave.approved", "leave.cancelled"], receivers: 1 });
});
after(async () => {
  await chest.close();
});

const request: LeaveRequest = {
  id: "42", memberId: "mbr_" + "h".repeat(26), typeId: "1", start: "2026-10-12", startHalf: "am", end: "2026-10-16", endHalf: "am",
  days: 4.5, note: "Family wedding", status: "approved", cancelAsked: false, decidedBy: "mbr_" + "c".repeat(26), decidedAt: "2026-10-01T09:00:00.000Z", reason: "", createdAt: "2026-09-30T09:00:00.000Z", event: "wedding",
};

test("an approved leave is told as who and which days — never its kind nor its note", async () => {
  await share.approved(request);
  assert.equal(chest.published.length, 1);
  const [e] = chest.published;
  assert.equal(e!.type, "leave.approved");
  assert.deepEqual(e!.data, { member: request.memberId, from: "2026-10-12", to: "2026-10-16", fromHalf: "am", toHalf: "am", request: "42" });
  // A pending or refused request tells nothing.
  await share.approved({ ...request, status: "pending" });
  assert.equal(chest.published.length, 1);
});

test("a cancelled leave is told; without events between tools, nothing breaks", async () => {
  await share.cancelled({ ...request, status: "cancelled" });
  assert.equal(chest.published.at(-1)!.type, "leave.cancelled");
  const bare = await fakeChest({ tool: "leave" });
  try {
    await share.approved(request);
  } finally {
    await bare.close();
  }
});
