import type { Member } from "@argentic/chest-sdk/member";
import type { FakeMember } from "@argentic/chest-sdk/testing";

// A test person as member() reads them from the Chest's assertion: the
// Chest's language and zone (the fake's defaults) when the person has none.
export function asMember(person: FakeMember): Member {
  return { ...person, language: person.language ?? "en", timeZone: person.timeZone ?? "UTC" };
}
