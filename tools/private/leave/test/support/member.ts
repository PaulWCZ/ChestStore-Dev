import type { Member } from "@argentic/chest-sdk/member";
import type { FakeMember } from "@argentic/chest-sdk/testing";

// A test person as member() reads them from the Chest's assertion: their
// language and zone, else the Chest's (as the fake Chest gives them).
export function asMember(person: FakeMember): Member {
  return { ...person, language: person.language ?? process.env["CHEST_LANGUAGE"] ?? "en", timeZone: person.timeZone ?? process.env["CHEST_TIME_ZONE"] ?? "UTC" };
}
