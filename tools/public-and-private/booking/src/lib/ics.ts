// Calendar files (RFC 5545): the guest's invitation and the host's feed.
// Plain text, lines of at most 75 octets folded with a space, CRLF, UTC
// times — every calendar (Google, Outlook, Apple) reads them.

export type CalendarEvent = {
  uid: string;
  sequence: number;
  start: Date;
  end: Date;
  summary: string;
  description?: string;
  location?: string;
  url?: string;
  cancelled?: boolean;
  stamp?: Date;
};

const utc = (d: Date) => d.toISOString().replace(/[-:]/gu, "").replace(/\.\d{3}/u, "");

// escape follows RFC 5545 §3.3.11: backslash, semicolon, comma, newline.
export function escape(text: string): string {
  return text.replace(/\\/gu, "\\\\").replace(/;/gu, "\\;").replace(/,/gu, "\\,").replace(/\r?\n/gu, "\\n").replace(/\p{Cc}/gu, "");
}

// fold cuts a content line into 75-octet pieces, never inside a character.
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

function event(e: CalendarEvent, now: Date): string[] {
  return [
    "BEGIN:VEVENT",
    `UID:${e.uid}`,
    `SEQUENCE:${e.sequence}`,
    `DTSTAMP:${utc(e.stamp ?? now)}`,
    `DTSTART:${utc(e.start)}`,
    `DTEND:${utc(e.end)}`,
    `SUMMARY:${escape(e.summary)}`,
    ...(e.description ? [`DESCRIPTION:${escape(e.description)}`] : []),
    ...(e.location ? [`LOCATION:${escape(e.location)}`] : []),
    ...(e.url ? [`URL:${e.url.replace(/[\r\n]/gu, "")}`] : []),
    `STATUS:${e.cancelled ? "CANCELLED" : "CONFIRMED"}`,
    "END:VEVENT",
  ];
}

// calendar writes a VCALENDAR. method "PUBLISH" (a feed, a file to open) or
// "CANCEL" (the event is withdrawn from the calendar that has it).
export function calendar(events: CalendarEvent[], options: { name?: string; method?: "PUBLISH" | "CANCEL"; now?: Date } = {}): string {
  const now = options.now ?? new Date();
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Chest//Booking//EN",
    "CALSCALE:GREGORIAN",
    `METHOD:${options.method ?? "PUBLISH"}`,
    ...(options.name ? [`X-WR-CALNAME:${escape(options.name)}`] : []),
    ...events.flatMap(e => event(e, now)),
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}
