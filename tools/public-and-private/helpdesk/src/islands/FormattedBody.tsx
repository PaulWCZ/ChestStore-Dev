import { useState } from "react";
import { Body } from "../components/body.tsx";

// A received email's words: the text, links clickable, the quoted history
// folded; "Show formatting" shows the HTML the Chest cleaned (allowed tags
// only: no script, no style, no image — and the policy runs no script and
// no inline style anyway).
export function FormattedBody({ text, html, email, t }: { text: string; html: string; email: boolean; t: { quoted: string; formatted: string; plain: string } }) {
  const [formatted, setFormatted] = useState(false);
  return (
    <>
      {formatted ? <div className="body html" dangerouslySetInnerHTML={{ __html: html }} /> : <Body text={text} contacts {...(email ? { quotedLabel: t.quoted } : {})} />}
      <button type="button" className="link-button small" aria-pressed={formatted} onClick={() => setFormatted(f => !f)}>{formatted ? t.plain : t.formatted}</button>
    </>
  );
}
