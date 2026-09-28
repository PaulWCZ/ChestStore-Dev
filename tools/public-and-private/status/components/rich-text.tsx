import type { ReactNode } from "react";

// What an editor wrote, shown safely: plain text, never HTML. Blank lines
// make paragraphs, line breaks stay, and web addresses become links (that
// open elsewhere, without passing on who sent the visitor).
const addresses = /\bhttps?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]]/gu;

function linked(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let n = 0;
  for (const m of text.matchAll(addresses)) {
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    out.push(<a key={`${keyBase}-${n++}`} href={m[0]} rel="nofollow noopener noreferrer" target="_blank">{m[0]}</a>);
    last = at + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function RichText({ text, className = "prose" }: { text: string; className?: string }) {
  const paragraphs = text.split(/\n{2,}/u).filter(p => p.trim() !== "");
  return (
    <div className={className}>
      {paragraphs.map((p, i) => <p key={i}>{linked(p, String(i))}</p>)}
    </div>
  );
}
