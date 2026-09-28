import type { ReactNode } from "react";
import { parse, type Inline } from "../lib/markdown.ts";

// A post's text, rendered from its small tree (lib/markdown.ts) as React
// elements: what a person wrote never reaches the page as markup. Links
// open in a new tab and carry no referrer.
function inline(nodes: Inline[], key = ""): ReactNode[] {
  return nodes.map((n, i) => {
    const k = key + i;
    if (n.t === "text") return n.v;
    if (n.t === "br") return <br key={k} />;
    if (n.t === "b") return <strong key={k}>{inline(n.c, k + "-")}</strong>;
    if (n.t === "i") return <em key={k}>{inline(n.c, k + "-")}</em>;
    return <a key={k} href={n.href} target="_blank" rel="noopener noreferrer nofollow">{inline(n.c, k + "-")}</a>;
  });
}

export function RichText({ text, className = "prose" }: { text: string; className?: string }) {
  const blocks = parse(text);
  return (
    <div className={className}>
      {blocks.map((b, i) => {
        if (b.t === "p") return <p key={i}>{inline(b.c)}</p>;
        if (b.t === "h") return <h2 key={i}>{inline(b.c)}</h2>;
        if (b.t === "quote") return <blockquote key={i}>{inline(b.c)}</blockquote>;
        if (b.t === "ul") return <ul key={i}>{b.items.map((item, j) => <li key={j}>{inline(item)}</li>)}</ul>;
        return <ol key={i} start={b.start}>{b.items.map((item, j) => <li key={j}>{inline(item)}</li>)}</ol>;
      })}
    </div>
  );
}
