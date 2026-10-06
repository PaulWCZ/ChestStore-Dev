import type { Member } from "@argentic/chest-sdk/member";
import type { FakeMember } from "@argentic/chest-sdk/testing";

// A test person as member() reads them from the Chest's assertion: without
// a language or a zone of their own, the Chest's (as the fake Chest gives).
export function asMember(person: FakeMember): Member {
  return { ...person, language: person.language ?? process.env["CHEST_LANGUAGE"] ?? "en", timeZone: person.timeZone ?? process.env["CHEST_TIME_ZONE"] ?? "UTC" };
}
