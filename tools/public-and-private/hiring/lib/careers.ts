import * as files from "@argentic/chest-sdk/files";
import type { Catalogue } from "./i18n/index.ts";
import type { Accent, Settings } from "./jobs.ts";

// The words of a retention: "2 years", "6 months".
export function retentionWords(t: Catalogue, months: number): string {
  return months === 6 ? t.retention.m6 : months === 12 ? t.retention.m12 : t.retention.m24;
}

// The careers page's brand as its pages show it: the logo and photos are
// public files of the tool (Proposal (studio): files.publicFiles), served
// by the Chest on the public host; the accent is one of the tool's own,
// each checked for contrast in light and dark (app/tokens.css).
export type Brand = { logo: string | null; photos: string[]; website: string; accent: Accent };

export function brandOf(s: Settings): Brand {
  const url = (image: { object: string; version: string }) => files.publicUrl(image.object, { version: image.version });
  return { logo: s.logo ? url(s.logo) : null, photos: s.photos.map(url), website: s.website, accent: s.accent };
}
