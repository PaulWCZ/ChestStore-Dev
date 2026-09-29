import { linkify, splitQuoted } from "../lib/text.ts";

// What someone wrote: line breaks kept, web addresses as links (a new
// tab, no referrer), and — for an email — the quoted conversation below it
// folded away ("Show the quoted text"). No HTML is read from the text.
// contacts (the team's side): email addresses and phone numbers too, as
// mailto: and tel: links.
export function Body({ text, quotedLabel, contacts = false }: { text: string; quotedLabel?: string; contacts?: boolean }) {
  const { main, quoted } = quotedLabel ? splitQuoted(text) : { main: text, quoted: "" };
  return (
    <div className="body">
      <Linked text={main} contacts={contacts} />
      {quoted && <details className="quoted"><summary>{quotedLabel}</summary><div className="body"><Linked text={quoted} contacts={contacts} /></div></details>}
    </div>
  );
}

function Linked({ text, contacts }: { text: string; contacts: boolean }) {
  return <>{linkify(text, { contacts }).map((p, i) => (!p.url ? p.text : p.url.startsWith("http") ? <a key={i} href={p.url} target="_blank" rel="noopener noreferrer nofollow">{p.text}</a> : <a key={i} href={p.url}>{p.text}</a>))}</>;
}
