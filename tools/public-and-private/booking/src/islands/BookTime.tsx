import { FormToken } from "@argentic/chest-app/client";
import { Picker, type PickerWords } from "../components/picker.tsx";
import type { Question } from "../shared/kinds.ts";
import type { ZoneGroup } from "../shared/zones.ts";

// A visitor books one kind of meeting: the free days and times (in their
// time zone), then their few fields and the host's questions
// (src/components/picker.tsx). The form appears once a time is picked: its
// token for bookTime is on the page from the start (FormToken).
export function BookTime(props: { hostSlug: string; typeSlug: string; hostName: string; hostZone: string; first: string | null; locale: string; zones: ZoneGroup[]; phone: boolean; company: string; questions: Question[]; mailing: boolean; t: PickerWords }) {
  return <><FormToken action="bookTime" /><Picker {...props} /></>;
}

// A guest moves their booking (/b/<secret>?move=1): a free time of its
// type, one button.
export function MoveMine({ secret, guestZone, ...props }: { secret: string; guestZone: string; hostSlug: string; typeSlug: string; hostName: string; hostZone: string; first: string | null; locale: string; zones: ZoneGroup[]; t: PickerWords }) {
  return <><FormToken action="moveMine" /><Picker {...props} move={{ secret, zone: guestZone }} /></>;
}
