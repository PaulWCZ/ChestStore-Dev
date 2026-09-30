import type { Member } from "@argentic/chest-sdk/member";
import type { FakeMember } from "@argentic/chest-sdk/testing";

// A test person as member() reads them from the Chest's assertion.
export function asMember(person: FakeMember): Member {
  return { language: "en", timeZone: "Europe/Paris", ...person };
}
