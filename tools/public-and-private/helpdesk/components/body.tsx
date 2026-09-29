import { linkify, splitQuoted } from "../lib/text.ts";

// What someone wrote: line breaks kept, web addresses as links (a new
// tab, no referrer), and — for an email — the quoted conversation below it
// folded away ("Show the quoted text"). No HTML is read from the text.
export function Body({ text, quotedLabel }: { text: string; quotedLabel?: string }) {
  const { main, quoted } = quotedLabel ? splitQuoted(text) : { main: text, quoted: "" };
  return (
    <div className="body">
      <Linked text={main} />
      {quoted && <details className="quoted"><summary>{quotedLabel}</summary><div className="body"><Linked text={quoted} /></div></details>}
    </div>
  );
}

function Linked({ text }: { text: string }) {
  return <>{linkify(text).map((p, i) => (p.url ? <a key={i} href={p.url} target="_blank" rel="noopener noreferrer nofollow">{p.text}</a> : p.text))}</>;
}
