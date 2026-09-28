import type { Catalogue } from "./i18n/index.ts";

// The words of a retention: "2 years", "6 months".
export function retentionWords(t: Catalogue, months: number): string {
  return months === 6 ? t.retention.m6 : months === 12 ? t.retention.m12 : t.retention.m24;
}
