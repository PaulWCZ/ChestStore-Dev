import { ChestError } from "@argentic/chest-sdk/errors";
import * as mail from "@argentic/chest-sdk/mail";

// Whether an email to a candidate would leave, asked before a page
// promises one (Proposal (studio.16): mail.available()):
//
// - "ready": the Chest sends now;
// - "later": the Chest is not sending right now ("suspended") or the
//   day's emails are used ("quota"): the outbox keeps it and tries again
//   (lib/outbox.ts), so the page says it leaves later;
// - "off": no mail on this Chest, or the owner has not connected the
//   company's mail: nothing would leave, so the page never offers it;
// - "unknown": the Chest did not answer: the page promises nothing new
//   (it keeps its usual words; the outbox tries again if a send fails).
//
// A snapshot: a send can still fail, and the pages' toasts still say what
// really happened.
export type MailState = "ready" | "later" | "off" | "unknown";

export function stateOf(answer: mail.MailAvailability): MailState {
  if (answer.ok) return "ready";
  return answer.reason === "suspended" || answer.reason === "quota" ? "later" : "off";
}

export async function mailState(): Promise<MailState> {
  try {
    return stateOf(await mail.available());
  } catch (error) {
    if (error instanceof ChestError) return "unknown";
    throw error;
  }
}
