// A page's text, as the server wrote it (src/lib/render.ts): HTML made from
// the document normalize() kept, every word escaped, links and pictures
// only those lib/doc.ts allows — never HTML a person wrote. The one place a
// page puts HTML in as it is.
export function Prose({ html, className = "prose" }: { html: string; className?: string }) {
  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
