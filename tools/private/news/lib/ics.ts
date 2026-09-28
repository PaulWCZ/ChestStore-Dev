// Safe in the browser: no SDK here.
// "Add to my calendar": an event as an iCalendar file (RFC 5545), which
// Outlook, Google Calendar, Apple Calendar and Thunderbird open. Written
// here rather than with a library: it is one event, and every rule it needs
// is below and tested — text escaping (3.3.11), lines folded at 75 octets
// without cutting a character (3.1), CRLF line ends, times in UTC (3.3.5,
// form 2) or whole days (VALUE=DATE).

export type CalendarEvent = {
  uid: string;
  title: string;
  description: string;
  place: string | null;
  // A whole day ("YYYY-MM-DD"), or a start and an end (instants).
  day: string;
  start: Date | null;
  end: Date | null;
  stamp: Date;
};

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
  const out: string[] = [];
  let current = "";
  let size = 0;
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    const room = out.length === 0 ? 75 : 74;
    if (size + bytes > room) {
      out.push(current);
      current = "";
      size = 0;
    }
    current += char;
    size += bytes;
  }
  out.push(current);
  return out.join("\r\n ");
}

const utc = (d: Date) => d.toISOString().replace(/[-:]/gu, "").replace(/\.\d{3}/u, "");
const date = (day: string) => day.replace(/-/gu, "");

function nextDay(day: string): string {
  const d = new Date(day + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// An event without an end is given one hour, as calendars do when an
// invitation says only when it starts.
const defaultLength = 60 * 60 * 1000;

export function calendar(event: CalendarEvent): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Chest store//News//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    "UID:" + event.uid,
    "DTSTAMP:" + utc(event.stamp),
    ...(event.start
      ? ["DTSTART:" + utc(event.start), "DTEND:" + utc(event.end ?? new Date(event.start.getTime() + defaultLength))]
      : ["DTSTART;VALUE=DATE:" + date(event.day), "DTEND;VALUE=DATE:" + date(nextDay(event.day))]),
    "SUMMARY:" + escape(event.title),
    ...(event.place ? ["LOCATION:" + escape(event.place)] : []),
    ...(event.description ? ["DESCRIPTION:" + escape(event.description)] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}
