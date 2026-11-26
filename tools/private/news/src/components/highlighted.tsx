import type { Segment } from "../lib/highlight.ts";

// A text with the words a search found marked (a marker pen, <mark>).
export function Highlighted({ segments }: { segments: Segment[] }) {
  return <>{segments.map((s, i) => (s.hit ? <mark key={i}>{s.text}</mark> : <span key={i}>{s.text}</span>))}</>;
}
