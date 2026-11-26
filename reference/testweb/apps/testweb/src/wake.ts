import type { Files } from "./files.js";

// The laboratory's slow wake: how long the tool waits, once started, before
// it listens, so that a proof can see the Chest's launch screen (tests/
// browser/sleep.spec.ts). It is kept in the tool's own files — never a
// variable of its manifest, nor a setting of the Chest —, written by a
// test route of the tool (POST /chest/api/wake-delay) and read at start.
const wakeFile = "lab/wake-delay.json";
/** The longest wait the laboratory may ask, in seconds: under the time a Chest gives a tool to start. */
export const maxWakeDelay = 30;

/** wakeDelay reads the wait asked, in seconds: none when nothing was asked, or when the files cannot be read. */
export async function wakeDelay(files: Files): Promise<number> {
  try {
    const kept = await files.get(wakeFile);
    if (!kept) return 0;
    const seconds = (JSON.parse(new TextDecoder().decode(kept.data)) as { seconds?: unknown }).seconds;
    return validWakeDelay(seconds) ? seconds : 0;
  } catch {
    return 0;
  }
}

/** setWakeDelay keeps the wait of the next starts; 0 removes it. */
export async function setWakeDelay(files: Files, seconds: number): Promise<void> {
  if (seconds === 0) { await files.remove(wakeFile); return; }
  await files.put(wakeFile, new TextEncoder().encode(JSON.stringify({ seconds })), "application/json");
}

/** validWakeDelay says a wait is whole seconds within the bound. */
export function validWakeDelay(seconds: unknown): seconds is number {
  return typeof seconds === "number" && Number.isInteger(seconds) && seconds >= 0 && seconds <= maxWakeDelay;
}
