import assert from "node:assert/strict";
import { test } from "node:test";
import { busyTimes, NotACalendar } from "../src/lib/ical.ts";

// Calendars as Google, Outlook and Apple write their secret iCal addresses
// (shapes from their own feeds: Google's "PRODID:-//Google Inc//Google
// Calendar 70.9054//EN", Outlook's "Microsoft Exchange Server 2010" with
// Windows zone names, Apple's with X-LIC-LOCATION), trimmed to what
// matters. Times are checked as UTC instants.
const crlf = (lines: string[]) => lines.join("\r\n") + "\r\n";
const iso = (ms: number) => new Date(ms).toISOString().replace(".000", "");
const window = { from: Date.parse("2026-10-01T00:00:00Z"), to: Date.parse("2026-11-30T00:00:00Z"), zone: "Europe/Paris" };
const spans = (text: string, w = window) => busyTimes(text, w).spans.map(s => `${iso(s.start)} ${iso(s.end)}`);

const google = crlf([
  "BEGIN:VCALENDAR",
  "PRODID:-//Google Inc//Google Calendar 70.9054//EN",
  "VERSION:2.0",
  "CALSCALE:GREGORIAN",
  "METHOD:PUBLISH",
  "X-WR-CALNAME:ines@atelier-martin.fr",
  "X-WR-TIMEZONE:Europe/Paris",
  "BEGIN:VEVENT",
  "DTSTART;TZID=Europe/Paris:20261005T100000",
  "DTEND;TZID=Europe/Paris:20261005T110000",
  "RRULE:FREQ=WEEKLY;WKST=MO;UNTIL=20261102T085959Z;BYDAY=MO",
  "EXDATE;TZID=Europe/Paris:20261012T100000",
  "DTSTAMP:20260929T080000Z",
  "UID:weekly-team@google.com",
  "SUMMARY:Team meeting — secret words",
  "DESCRIPTION:Long agenda\\, with commas",
  " and a folded line",
  "STATUS:CONFIRMED",
  "TRANSP:OPAQUE",
  "END:VEVENT",
  // The 19 October occurrence moved to the Tuesday afternoon.
  "BEGIN:VEVENT",
  "DTSTART;TZID=Europe/Paris:20261020T150000",
  "DTEND;TZID=Europe/Paris:20261020T160000",
  "RECURRENCE-ID;TZID=Europe/Paris:20261019T100000",
  "UID:weekly-team@google.com",
  "SUMMARY:Team meeting (moved)",
  "END:VEVENT",
  // A whole day off, busy; a birthday, free.
  "BEGIN:VEVENT",
  "DTSTART;VALUE=DATE:20261014",
  "DTEND;VALUE=DATE:20261016",
  "UID:off@google.com",
  "SUMMARY:Dentist and rest",
  "TRANSP:OPAQUE",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "DTSTART;VALUE=DATE:20261021",
  "DTEND;VALUE=DATE:20261022",
  "UID:birthday@google.com",
  "SUMMARY:Birthday",
  "TRANSP:TRANSPARENT",
  "END:VEVENT",
  // A cancelled meeting, and one in UTC with a DURATION.
  "BEGIN:VEVENT",
  "DTSTART:20261007T120000Z",
  "DTEND:20261007T130000Z",
  "UID:cancelled@google.com",
  "STATUS:CANCELLED",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "DTSTART:20261008T123000Z",
  "DURATION:PT45M",
  "UID:lunch@google.com",
  "SUMMARY:Lunch",
  "END:VEVENT",
  "END:VCALENDAR",
]);

test("Google: weekly with an exception and a moved occurrence, whole days, free and cancelled events, UTC and durations", () => {
  assert.deepEqual(spans(google), [
    "2026-10-05T08:00:00Z 2026-10-05T09:00:00Z",
    "2026-10-08T12:30:00Z 2026-10-08T13:15:00Z",
    // 12 October: excluded. 14–15 October: whole days in Paris.
    "2026-10-13T22:00:00Z 2026-10-15T22:00:00Z",
    // 19 October moved to Tuesday 20 at 15:00 Paris.
    "2026-10-20T13:00:00Z 2026-10-20T14:00:00Z",
    "2026-10-26T09:00:00Z 2026-10-26T10:00:00Z", // after the clocks go back: still 10:00 in Paris
    // UNTIL 2 November 08:59:59Z: the 2 November occurrence (09:00Z) is not in.
  ]);
  assert.equal(busyTimes(google, window).events, 6);
});

const outlook = crlf([
  "BEGIN:VCALENDAR",
  "METHOD:PUBLISH",
  "PRODID:Microsoft Exchange Server 2010",
  "VERSION:2.0",
  "X-WR-CALNAME:Calendar",
  "BEGIN:VTIMEZONE",
  "TZID:Romance Standard Time",
  "BEGIN:STANDARD",
  "DTSTART:16010101T030000",
  "TZOFFSETFROM:+0200",
  "TZOFFSETTO:+0100",
  "RRULE:FREQ=YEARLY;INTERVAL=1;BYDAY=-1SU;BYMONTH=10",
  "END:STANDARD",
  "BEGIN:DAYLIGHT",
  "DTSTART:16010101T020000",
  "TZOFFSETFROM:+0100",
  "TZOFFSETTO:+0200",
  "RRULE:FREQ=YEARLY;INTERVAL=1;BYDAY=-1SU;BYMONTH=3",
  "END:DAYLIGHT",
  "END:VTIMEZONE",
  "BEGIN:VTIMEZONE",
  "TZID:Customized Time Zone",
  "BEGIN:STANDARD",
  "DTSTART:16010101T030000",
  "TZOFFSETFROM:+0200",
  "TZOFFSETTO:+0100",
  "RRULE:FREQ=YEARLY;INTERVAL=1;BYDAY=-1SU;BYMONTH=10",
  "END:STANDARD",
  "BEGIN:DAYLIGHT",
  "DTSTART:16010101T020000",
  "TZOFFSETFROM:+0100",
  "TZOFFSETTO:+0200",
  "RRULE:FREQ=YEARLY;INTERVAL=1;BYDAY=-1SU;BYMONTH=3",
  "END:DAYLIGHT",
  "END:VTIMEZONE",
  // Every working day, 5 times: Monday 5 to Friday 9 October.
  "BEGIN:VEVENT",
  "RRULE:FREQ=DAILY;COUNT=5;BYDAY=MO,TU,WE,TH,FR",
  "SUMMARY:Stand-up",
  "DTSTART;TZID=Romance Standard Time:20261005T091500",
  "DTEND;TZID=Romance Standard Time:20261005T093000",
  "UID:040000008200E00074C5B7101A82E00800000000",
  "CLASS:PUBLIC",
  "TRANSP:OPAQUE",
  "X-MICROSOFT-CDO-BUSYSTATUS:BUSY",
  "END:VEVENT",
  // The last working day of each month, in the calendar's own zone.
  "BEGIN:VEVENT",
  "RRULE:FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1",
  "DTSTART;TZID=Customized Time Zone:20260930T160000",
  "DTEND;TZID=Customized Time Zone:20260930T170000",
  "UID:monthly-close",
  "SUMMARY:Month close",
  "END:VEVENT",
  "END:VCALENDAR",
]);

test("Outlook: Windows zone names, its own VTIMEZONE, daily with COUNT, the last working day of the month", () => {
  assert.deepEqual(spans(outlook), [
    "2026-10-05T07:15:00Z 2026-10-05T07:30:00Z",
    "2026-10-06T07:15:00Z 2026-10-06T07:30:00Z",
    "2026-10-07T07:15:00Z 2026-10-07T07:30:00Z",
    "2026-10-08T07:15:00Z 2026-10-08T07:30:00Z",
    "2026-10-09T07:15:00Z 2026-10-09T07:30:00Z",
    // 30 October (Friday), after the change: UTC+1.
    "2026-10-30T15:00:00Z 2026-10-30T16:00:00Z",
  ]);
});

test("Apple: a zone with X-LIC-LOCATION, monthly on the second Tuesday, yearly, RDATE; floating times in the host's zone", () => {
  const apple = crlf([
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Apple Inc.//macOS 15.0//EN",
    "BEGIN:VTIMEZONE",
    "TZID:America/Montreal",
    "X-LIC-LOCATION:America/Montreal",
    "END:VTIMEZONE",
    "BEGIN:VEVENT",
    "DTSTART;TZID=America/Montreal:20260908T090000",
    "DTEND;TZID=America/Montreal:20260908T100000",
    "RRULE:FREQ=MONTHLY;BYDAY=2TU",
    "RDATE;TZID=America/Montreal:20261029T090000",
    "UID:A1B2",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "DTSTART:20241106T180000",
    "DTEND:20241106T200000",
    "RRULE:FREQ=YEARLY",
    "UID:yearly-floating",
    "END:VEVENT",
    "END:VCALENDAR",
  ]);
  assert.deepEqual(spans(apple), [
    "2026-10-13T13:00:00Z 2026-10-13T14:00:00Z",
    "2026-10-29T13:00:00Z 2026-10-29T14:00:00Z",
    // 6 November, 18:00 in Paris (floating: the host's zone).
    "2026-11-06T17:00:00Z 2026-11-06T19:00:00Z",
    "2026-11-10T14:00:00Z 2026-11-10T15:00:00Z", // Montreal back on EST
  ]);
});

test("overlapping events merge; the window clips; text that is no calendar is refused", () => {
  const two = crlf(["BEGIN:VCALENDAR", "BEGIN:VEVENT", "DTSTART:20261001T080000Z", "DTEND:20261001T100000Z", "END:VEVENT", "BEGIN:VEVENT", "DTSTART:20261001T090000Z", "DTEND:20261001T110000Z", "END:VEVENT", "BEGIN:VEVENT", "DTSTART:20260930T230000Z", "DTEND:20261001T010000Z", "END:VEVENT", "END:VCALENDAR"]);
  assert.deepEqual(spans(two), ["2026-10-01T00:00:00Z 2026-10-01T01:00:00Z", "2026-10-01T08:00:00Z 2026-10-01T11:00:00Z"]);
  assert.throws(() => busyTimes("<!doctype html><title>Sign in</title>", window), NotACalendar);
  // An endless daily rule from years ago stays within its bounds.
  const old = crlf(["BEGIN:VCALENDAR", "BEGIN:VEVENT", "DTSTART;TZID=Europe/Paris:20100104T120000", "DTEND;TZID=Europe/Paris:20100104T130000", "RRULE:FREQ=DAILY", "END:VEVENT", "END:VCALENDAR"]);
  assert.equal(busyTimes(old, window).spans.length, 60);
});
