import { Fragment } from "react";
import { markdown, type Inline } from "../lib/markdown.ts";

// A description written in the small Markdown of lib/markdown.ts, drawn
// with React elements (every text escaped); links open in a new tab.
export function Markdown({ text }: { text: string }) {
  return (
    <>
      {markdown(text).map((b, i) =>
        b.type === "heading" ? (b.level === 1 ? <h3 key={i} className="md-h">{spans(b.children)}</h3> : <h4 key={i} className="md-h">{spans(b.children)}</h4>)
        : b.type === "list" ? (b.ordered ? <ol key={i}>{b.items.map((item, j) => <li key={j}>{spans(item)}</li>)}</ol> : <ul key={i}>{b.items.map((item, j) => <li key={j}>{spans(item)}</li>)}</ul>)
        : <p key={i}>{b.lines.map((line, j) => <Fragment key={j}>{j > 0 && <br />}{spans(line)}</Fragment>)}</p>,
      )}
    </>
  );
}

function spans(nodes: Inline[]) {
  return nodes.map((n, i) =>
    n.type === "text" ? <Fragment key={i}>{n.text}</Fragment>
    : n.type === "code" ? <code key={i}>{n.text}</code>
    : n.type === "strong" ? <strong key={i}>{spans(n.children)}</strong>
    : n.type === "em" ? <em key={i}>{spans(n.children)}</em>
    : n.type === "link" ? <a key={i} href={n.href} target="_blank" rel="noopener noreferrer nofollow" onClick={e => e.stopPropagation()}>{spans(n.children)}</a>
    : null,
  );
}
