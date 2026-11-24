import type { Member } from "@argentic/chest-sdk/member";
import { withMember, type FakeMember } from "@argentic/chest-sdk/testing";

// A test person as member() reads them from the Chest's assertion: their
// language and zone, else the Chest's (as the fake Chest gives them).
export function asMember(person: FakeMember): Member {
  return { ...person, language: person.language ?? process.env["CHEST_LANGUAGE"] ?? "en", timeZone: person.timeZone ?? process.env["CHEST_TIME_ZONE"] ?? "UTC" };
}

// The request of a member as the Chest makes it (its assertion and its
// Chest-Opener ticket): what a service needs to open sealed values on
// their behalf (lib/sealing.ts).
export function opener(member: Member): Request {
  return withMember(new Request("http://tool/chest"), member as FakeMember);
}
