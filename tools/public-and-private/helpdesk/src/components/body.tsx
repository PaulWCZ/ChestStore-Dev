import { linkify } from "../shared/text.ts";

// What someone wrote: line breaks kept, web addresses as links (a new
// tab, no referrer). No HTML is read from the text. contacts (the team's
// side): email addresses and phone numbers too, as mailto: and tel: links.
export function Body({ text, contacts = false }: { text: string; contacts?: boolean }) {
  return (
    <div className="body">
      <Linked text={text} contacts={contacts} />
    </div>
  );
}

function Linked({ text, contacts }: { text: string; contacts: boolean }) {
  return <>{linkify(text, { contacts }).map((p, i) => (!p.url ? p.text : p.url.startsWith("http") ? <a key={i} href={p.url} target="_blank" rel="noopener noreferrer nofollow">{p.text}</a> : <a key={i} href={p.url}>{p.text}</a>))}</>;
}
