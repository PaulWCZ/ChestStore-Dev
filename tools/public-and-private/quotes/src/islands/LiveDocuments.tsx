import { useLive } from "@argentic/chest-app/client";

// The desk and the lists follow the Chest's realtime (SDK 0.7.0), never a
// timer: the feeds of chest.json carry each changed row's id on the
// channel "documents" — a quote accepted online, a payment recorded by
// someone else, an invoice handed over by Timesheets — and the page is
// read again (a read with nothing new is a 304: src/app.tsx, the pages'
// version). The tool sleeps while the page stays open. Nothing to see.
export function LiveDocuments() {
  useLive("documents", ["documents", "payments", "quote_answers"], { focus: true });
  return null;
}
