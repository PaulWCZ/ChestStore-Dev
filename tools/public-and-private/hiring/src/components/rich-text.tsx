import { parse, type Inline } from "../shared/rich-text.ts";

// A job's description as React elements: headings, paragraphs, lists,
// bold. Never HTML from the text: what is written is shown as text.
const words = (parts: Inline[]) => parts.map((p, i) => (p.bold ? <strong key={i}>{p.text}</strong> : <span key={i}>{p.text}</span>));

export function RichText({ source, className = "prose" }: { source: string; className?: string }) {
  return (
    <div className={className}>
      {parse(source).map((b, i) => {
        if (b.kind === "heading") return <h2 key={i}>{words(b.content)}</h2>;
        if (b.kind === "paragraph") return <p key={i}>{b.lines.map((line, j) => <span key={j}>{j > 0 && <br />}{words(line)}</span>)}</p>;
        const items = b.items.map((item, j) => <li key={j}>{words(item)}</li>);
        return b.kind === "bullets" ? <ul key={i}>{items}</ul> : <ol key={i}>{items}</ol>;
      })}
    </div>
  );
}
