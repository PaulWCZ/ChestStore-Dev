import { ChestError } from "@argentic/chest-sdk/errors";
import * as mail from "@argentic/chest-sdk/mail";

// Whether the welcome email would leave, asked before the start form
// promises it (Proposal (studio.16): mail.available()):
//
// - "ready": the Chest sends now;
// - "later": the Chest is not sending right now ("suspended") or the
//   day's emails are used ("quota"): the welcome is sent once, when the
//   checklist starts (no outbox), so the form says it will not leave;
// - "off": no mail on this Chest, or the owner has not connected the
//   company's mail: the form says no welcome email will leave;
// - "unknown": the Chest did not answer: the form promises nothing.
//
// A snapshot: the send can still fail, and the person's own email choice
// may hold it back; the toast after starting says what really happened.
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
