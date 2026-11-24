import type { FakeChest, FakeNotification } from "@argentic/chest-sdk/testing";

// SDK 0.7.0's fake Chest keeps each notification already in its member's
// language (the notice's translation for it, else its English words). To
// see a notice in a language, send it while the member reads that one:
// noticeIn sets the member's language, sends, gives back the item the
// member got (the last one, by key when given), and restores the language.
export async function noticeIn(chest: FakeChest, member: string, language: string, send: () => Promise<unknown>, key?: string): Promise<FakeNotification> {
  const person = chest.members.find(m => m.id === member);
  if (!person) throw new Error(`no member ${member} in the fake Chest`);
  const was = person.language;
  person.language = language;
  try {
    await send();
  } finally {
    person.language = was;
  }
  const item = chest.notifications.filter(n => n.member === member && (key === undefined || n.key === key)).at(-1);
  if (!item) throw new Error(`no notice for ${member}`);
  return item;
}
