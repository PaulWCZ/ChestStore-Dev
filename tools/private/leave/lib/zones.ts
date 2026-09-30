import { chest } from "@argentic/chest-sdk/chest";
import { ChestError } from "@argentic/chest-sdk/errors";
import * as members from "@argentic/chest-sdk/members";

// Where each person works, for what concerns them alone: the hours of
// their leave in their own calendar and in their busy times — someone
// working from Montréal is off from their own midnight, and a half day
// ends at their noon (SDK: "store in UTC, decide in the Chest's zone, show
// in the member's"). The days themselves stay the company's: a leave is
// the 12th to the 16th for HR, payroll and the person alike. The zone is
// the one the Chest answers for them (members API); someone it no longer
// answers for (former, erased, the Chest unreachable) and a zone this
// runtime does not know keep the Chest's.
export type ZoneOf = (memberId: string) => string;

const known = (zone: string): boolean => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
};

export async function zonesOf(ids: Iterable<string>): Promise<ZoneOf> {
  const fallback = chest.timeZone;
  const found = new Map<string, string>();
  const wanted = [...new Set(ids)].filter(id => typeof id === "string" && id.startsWith("mbr_"));
  if (wanted.length > 0) {
    try {
      for (const m of (await members.lookup(wanted)).members) if (known(m.timeZone)) found.set(m.id, m.timeZone);
    } catch (error) {
      if (!(error instanceof ChestError)) throw error;
    }
  }
  return id => found.get(id) ?? fallback;
}
