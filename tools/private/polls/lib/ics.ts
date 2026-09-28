// Safe in the browser: no SDK here.
// "Add to my calendar": the chosen date of a poll as an iCalendar file (RFC
// 5545), which Outlook, Google Calendar, Apple Calendar and Thunderbird
// open. Adapted from the studio's Booking (lib/ics.ts, MIT, same authors),
// with whole days (VALUE=DATE) added: text escaping (3.3.11), lines folded
// at 75 octets without cutting a character (3.1), CRLF line ends, times in
// UTC (3.3.5, form 2).

export type CalendarEvent = {
  uid: string;
  sequence: number;
  summary: string;
  description?: string;
  url?: string;
  // A whole day ("YYYY-MM-DD"), or a start and an end (instants).
  day: string;
  start: Date | null;
  end: Date | null;
  stamp: Date;
};

const utc = (d: Date) => d.toISOString().replace(/[-:]/gu, "").replace(/\.\d{3}/u, "");
const date = (day: string) => day.replace(/-/gu, "");

// escape writes a TEXT value: backslash, semicolon and comma escaped, line
// breaks as \n, other control characters dropped.
export function escape(text: string): string {
  return text
    .replace(/\r\n?/gu, "\n")
    .replace(/[^\P{Cc}\n]/gu, "")
    .replace(/\\/gu, "\\\\")
    .replace(/;/gu, "\\;")
    .replace(/,/gu, "\\,")
    .replace(/\n/gu, "\\n");
}

// fold cuts a content line into lines of 75 octets at most (UTF-8), each
// continuation starting with one space; a character is never split.
export function fold(line: string): string {
  const encoder = new TextEncoder();
  const pieces: string[] = [];
  let current = "";
  let size = 0;
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    const limit = pieces.length === 0 ? 75 : 74;
    if (size + bytes > limit) {
      pieces.push(current);
      current = "";
      size = 0;
    }
    current += char;
    size += bytes;
  }
  pieces.push(current);
  return pieces.join("\r\n ");
}

export function nextDay(day: string): string {
  const d = new Date(day + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// An event with a start and no end is given two hours.
const defaultLength = 2 * 60 * 60 * 1000;

export function calendar(e: CalendarEvent): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Chest store//Polls//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${e.uid}`,
    `SEQUENCE:${e.sequence}`,
    `DTSTAMP:${utc(e.stamp)}`,
    ...(e.start
      ? [`DTSTART:${utc(e.start)}`, `DTEND:${utc(e.end ?? new Date(e.start.getTime() + defaultLength))}`]
      : [`DTSTART;VALUE=DATE:${date(e.day)}`, `DTEND;VALUE=DATE:${date(nextDay(e.day))}`]),
    `SUMMARY:${escape(e.summary)}`,
    ...(e.description ? [`DESCRIPTION:${escape(e.description)}`] : []),
    ...(e.url ? [`URL:${e.url.replace(/[\r\n\s]/gu, "")}`] : []),
    "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}
