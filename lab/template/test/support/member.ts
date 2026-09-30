import type { Member } from "@argentic/chest-sdk/member";
import type { FakeMember } from "@argentic/chest-sdk/testing";

// A test person as member() reads them from the Chest's assertion: a
// language and a zone always (the Chest's, as the fake Chest gives them,
// when the person names none).
export function asMember(person: FakeMember): Member {
  return { ...person, language: person.language ?? "en", timeZone: person.timeZone ?? "Europe/Paris" };
}
