import { useLive } from "@argentic/chest-app/client";

// A page others change (new answers, a form published, shared or closed)
// follows the Chest's realtime (SDK 0.7.0), never a timer: the feeds of
// chest.json carry each changed row's id on the channel "forms" — an id
// only, the page's read decides what its reader sees —, and the page is
// read again (useLive: what is typed and the islands' state stay; a read
// whose version did not change is a 304). The tool sleeps while the page
// stays open. A visitor's public form is not live: realtime is for members.
export function LiveForms() {
  useLive("forms", ["answers", "forms"], { focus: true });
  return null;
}
