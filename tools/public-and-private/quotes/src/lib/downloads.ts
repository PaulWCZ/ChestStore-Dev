import { ChestError } from "@argentic/chest-sdk/errors";
import type { Query } from "./db.ts";

// The files the public part hands out — a quote's PDF, an earlier
// version's, the terms and conditions of sale — to whoever holds a quote's
// link. Anyone on the Internet may ask, so each answer is bounded:
// - at most two at once in the process (a PDF is held whole in memory,
//   drawn or read from the Chest's files; 256 MiB a tool): a slot is taken
//   before the file is made and given back once its last byte has left,
//   or the download was cancelled, or after two minutes (a reader that
//   stalls holds no slot for ever); the others are told to come back in a
//   moment (503, Retry-After);
// - so many an hour per link (linkGuard), whoever asks: a link that leaks
//   cannot be made to hand out its files for ever (429, Retry-After).
// The files themselves are kept in the process by their fingerprint
// (src/lib/kept.ts): a burst of readers asks the Chest once.
export const downloadLimits = { inFlight: 2, retryAfter: 5, seconds: 120, chunk: 64 << 10, perLinkHour: 60 } as const;

let inFlight = 0;
// How many public downloads hold a slot now (tests).
export const downloadsInFlight = (): number => inFlight;

const none = (status: number, headers: Record<string, string> = {}) => new Response(null, { status, headers: { "Cache-Control": "no-store", ...headers } });

// One more use of a link's files this hour; past the bound, false (and
// the use is not counted).
export async function linkGuard(sql: Query, linkId: string, now = new Date()): Promise<boolean> {
  const hour = new Date(Math.floor(now.getTime() / 3_600_000) * 3_600_000);
  const [row] = await sql<{ count: number }[]>`
    insert into link_reads (link_id, hour, count) values (${linkId}, ${hour}, 1)
    on conflict (link_id, hour) do update set count = link_reads.count + 1
    returning count`;
  if ((row?.count ?? 0) > downloadLimits.perLinkHour) {
    await sql`update link_reads set count = count - 1 where link_id = ${linkId} and hour = ${hour}`;
    return false;
  }
  if (Math.random() < 0.05) await sql`delete from link_reads where hour < ${new Date(hour.getTime() - 86_400_000)}`;
  return true;
}

export type PublicFile = { bytes: Uint8Array; name: string; disposition: "inline" | "attachment"; type: string };

// publicFile answers a file of the public part within the bounds above:
// `make` finds and makes it (null: 404), once a slot is held.
export async function publicFile(make: () => Promise<PublicFile | Response | null>): Promise<Response> {
  if (inFlight >= downloadLimits.inFlight) return none(503, { "Retry-After": String(downloadLimits.retryAfter) });
  inFlight++;
  let held = true;
  let handed = false;
  const free = () => {
    if (held) inFlight--;
    held = false;
  };
  try {
    let file: PublicFile | Response | null;
    try {
      file = await make();
    } catch (error) {
      if (error instanceof ChestError) return none(503, { "Retry-After": String(downloadLimits.retryAfter) });
      throw error;
    }
    if (file instanceof Response) return file;
    if (!file) return none(404);
    let data: Uint8Array | null = file.bytes;
    let at = 0;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        deadline = setTimeout(() => {
          data = null;
          free();
          controller.error(new Error("download too slow"));
        }, downloadLimits.seconds * 1000);
        deadline.unref?.();
      },
      pull(controller) {
        if (!data) return;
        if (at >= data.byteLength) {
          clearTimeout(deadline);
          data = null;
          free();
          controller.close();
          return;
        }
        controller.enqueue(data.slice(at, at + downloadLimits.chunk));
        at += downloadLimits.chunk;
      },
      cancel() {
        clearTimeout(deadline);
        data = null;
        free();
      },
    });
    const response = new Response(body, {
      headers: {
        "Content-Type": file.type,
        "Content-Length": String(file.bytes.byteLength),
        "Content-Disposition": disposition(file.disposition, file.name),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Robots-Tag": "noindex",
        "Referrer-Policy": "no-referrer",
      },
    });
    // The body now holds the slot.
    handed = true;
    return response;
  } finally {
    if (!handed) free();
  }
}

// A download's name: ASCII in filename (any other character an
// underscore), the name itself in filename* (RFC 6266).
export function disposition(kind: "inline" | "attachment", name: string): string {
  return `${kind}; filename="${name.replace(/[^\x20-\x7e]|["\\]/gu, "_")}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}
