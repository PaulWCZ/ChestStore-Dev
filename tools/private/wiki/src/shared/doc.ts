// The parts of the document's rules the browser needs too (the editor
// keeps the same links and pictures as the server): pure, no server code.
// src/lib/doc.ts holds the rest (normalize(), lines(), references()…) and
// re-exports these.

export type Mark = { type: string; attrs?: Record<string, unknown> };
export type DocNode = { type: string; attrs?: Record<string, unknown>; content?: DocNode[]; text?: string; marks?: Mark[] };
export type Doc = { type: "doc"; content: DocNode[] };

export const docLimits = {
  bytes: 2_000_000,
  nodes: 60_000,
  depth: 24,
  text: 400_000,
  href: 2000,
} as const;

export const tones = ["info", "tip", "warning"] as const;

export const emptyDoc = (): Doc => ({ type: "doc", content: [{ type: "paragraph" }] });

// Links a reader may follow: the web, mail, and this wiki's own pages and
// files (relative, so they work on any Chest's address).
const pagePath = /^\/chest\/pages\/([1-9][0-9]{0,17})(#[A-Za-z0-9_-]{1,80})?$/u;
const filePath = /^\/chest\/files\/([1-9][0-9]{0,17})(\?download)?$/u;
export function safeHref(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const href = value.trim();
  if (href === "" || href.length > docLimits.href || /[\p{Cc}\\]/u.test(href)) return null;
  if (pagePath.test(href) || filePath.test(href) || /^#[A-Za-z0-9_-]{1,80}$/u.test(href)) return href;
  if (/^mailto:[^\s/:?#]+@[^\s/:?#]+(\?[^\s]*)?$/iu.test(href)) return href;
  try {
    const url = new URL(href);
    if ((url.protocol === "http:" || url.protocol === "https:") && url.hostname !== "" && !url.username && !url.password) return url.href;
  } catch {
    return null;
  }
  return null;
}

// An image shows a file of the wiki only: nothing is loaded from elsewhere.
export function safeImage(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const m = /^\/chest\/files\/([1-9][0-9]{0,17})$/u.exec(value.trim());
  return m ? `/chest/files/${m[1]}` : null;
}

export const pageIdOfHref = (href: string): string | null => pagePath.exec(href)?.[1] ?? null;
export const fileIdOfHref = (href: string): string | null => filePath.exec(href)?.[1] ?? /^\/chest\/files\/([1-9][0-9]{0,17})$/u.exec(href)?.[1] ?? null;

// Google wraps every link of a document (an export, a paste from Google
// Docs) in a redirect: the address it leads to.
export function unwrapRedirect(href: string): string {
  const m = /^https?:\/\/(?:www\.)?google\.[a-z.]+\/url\?(.*)$/iu.exec(href);
  if (!m) return href;
  try {
    return new URLSearchParams(m[1]).get("q") ?? href;
  } catch {
    return href;
  }
}
