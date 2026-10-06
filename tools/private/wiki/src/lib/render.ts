import { pageIdOfHref, slug, type Doc, type DocNode, type Mark } from "./doc.ts";

// HTML from a normalized document, made by the server: every text and
// attribute escaped, only the elements written here. The reading page, the
// history and the HTML export all use it.

export const escapeHtml = (text: string): string => text.replace(/[&<>"']/gu, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export type Heading = { id: string; text: string; level: number };
export type RenderOptions = {
  // The current title of a page this one points to; undefined when it is
  // gone or out of the reader's sight.
  title: (pageId: string) => string | undefined;
  // What a link to another page is called when that page is gone.
  missing: string;
  // How a page's or a file's address is written (exports rewrite them).
  pageHref?: (pageId: string, anchor: string) => string;
  fileHref?: (fileId: string, download: boolean) => string;
};

function wrap(html: string, marks: Mark[] | undefined, o: RenderOptions): string {
  let out = html;
  for (const m of marks ?? []) {
    switch (m.type) {
      case "bold": out = `<strong>${out}</strong>`; break;
      case "italic": out = `<em>${out}</em>`; break;
      case "underline": out = `<u>${out}</u>`; break;
      case "strike": out = `<s>${out}</s>`; break;
      case "code": out = `<code>${out}</code>`; break;
      case "link": {
        const href = String(m.attrs?.["href"] ?? "");
        out = link(href, out, o);
        break;
      }
    }
  }
  return out;
}

function link(href: string, inside: string, o: RenderOptions): string {
  const page = pageIdOfHref(href);
  if (page) {
    const anchor = href.includes("#") ? href.slice(href.indexOf("#")) : "";
    if (o.title(page) === undefined) return `<span class="broken-link" title="${escapeHtml(o.missing)}">${inside}</span>`;
    return `<a href="${escapeHtml(o.pageHref ? o.pageHref(page, anchor) : href)}">${inside}</a>`;
  }
  const file = /^\/chest\/files\/([0-9]+)(\?download)?$/u.exec(href);
  if (file) return `<a href="${escapeHtml(o.fileHref ? o.fileHref(file[1]!, Boolean(file[2])) : href)}" class="file-link">${inside}</a>`;
  if (href.startsWith("#")) return `<a href="${escapeHtml(href)}">${inside}</a>`;
  return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer nofollow">${inside}</a>`;
}

function inline(nodes: DocNode[] | undefined, o: RenderOptions): string {
  return (nodes ?? []).map(n => {
    if (n.type === "text") return wrap(escapeHtml(n.text ?? ""), n.marks, o);
    if (n.type === "hardBreak") return "<br>";
    if (n.type === "pageRef") {
      const id = String(n.attrs?.["id"] ?? "");
      const title = o.title(id);
      if (title === undefined) return `<span class="page-ref broken-link">${escapeHtml(o.missing)}</span>`;
      return `<a class="page-ref" href="${escapeHtml(o.pageHref ? o.pageHref(id, "") : `/chest/pages/${id}`)}">${escapeHtml(title)}</a>`;
    }
    return "";
  }).join("");
}

export function render(doc: Doc, o: RenderOptions): { html: string; headings: Heading[] } {
  const headings: Heading[] = [];
  // The page's own ids are never taken by a heading.
  const used = new Set<string>(["main", "q", "top", "content", "toc", "title", "dialog-title", "section"]);
  const cell = (n: DocNode, tag: "td" | "th") => {
    const span = (k: string) => (n.attrs?.[k] && Number(n.attrs[k]) > 1 ? ` ${k}="${Number(n.attrs[k])}"` : "");
    return `<${tag}${span("colspan")}${span("rowspan")}>${blocks(n.content, true)}</${tag}>`;
  };
  // In a cell or a list item, a lone paragraph is written without <p>.
  const blocks = (nodes: DocNode[] | undefined, tight = false): string => {
    const list = nodes ?? [];
    if (tight && list.length === 1 && list[0]!.type === "paragraph") return inline(list[0]!.content, o);
    return list.map(n => one(n)).join("\n");
  };
  const one = (n: DocNode): string => {
    switch (n.type) {
      case "paragraph":
        return `<p>${inline(n.content, o)}</p>`;
      case "heading": {
        const level = Math.min(Math.max(Number(n.attrs?.["level"] ?? 1), 1), 3);
        const text = (n.content ?? []).map(c => (c.type === "text" ? c.text ?? "" : c.type === "pageRef" ? o.title(String(c.attrs?.["id"])) ?? "" : "")).join("");
        let id = slug(text);
        for (let i = 2; used.has(id); i++) id = `${slug(text)}-${i}`;
        used.add(id);
        headings.push({ id, text, level });
        return `<h${level + 1} id="${id}">${inline(n.content, o)}</h${level + 1}>`;
      }
      case "blockquote":
        return `<blockquote>${blocks(n.content)}</blockquote>`;
      case "callout": {
        const tone = ["info", "tip", "warning"].includes(String(n.attrs?.["tone"])) ? String(n.attrs?.["tone"]) : "info";
        return `<aside class="callout ${tone}" role="note">${blocks(n.content)}</aside>`;
      }
      case "bulletList":
        return `<ul>${(n.content ?? []).map(li => `<li>${blocks(li.content, true)}</li>`).join("")}</ul>`;
      case "orderedList": {
        const start = Number(n.attrs?.["start"] ?? 1);
        return `<ol${start !== 1 ? ` start="${start}"` : ""}>${(n.content ?? []).map(li => `<li>${blocks(li.content, true)}</li>`).join("")}</ol>`;
      }
      case "taskList":
        return `<ul class="tasks">${(n.content ?? []).map(li => {
          const checked = li.attrs?.["checked"] === true;
          return `<li${checked ? ' class="done"' : ""}><input type="checkbox" disabled${checked ? " checked" : ""}><div>${blocks(li.content, true)}</div></li>`;
        }).join("")}</ul>`;
      case "codeBlock":
        return `<pre><code>${escapeHtml((n.content ?? []).map(c => c.text ?? "").join(""))}</code></pre>`;
      case "horizontalRule":
        return "<hr>";
      case "image": {
        const src = String(n.attrs?.["src"] ?? "");
        const file = /^\/chest\/files\/([0-9]+)$/u.exec(src)?.[1];
        if (!file) return "";
        const alt = escapeHtml(String(n.attrs?.["alt"] ?? ""));
        const caption = String(n.attrs?.["title"] ?? "");
        const href = escapeHtml(o.fileHref ? o.fileHref(file, false) : src);
        return `<figure><img src="${href}" alt="${alt}" loading="lazy">${caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ""}</figure>`;
      }
      case "table": {
        const rows = n.content ?? [];
        const head = rows[0]?.content?.every(c => c.type === "tableHeader") ? rows[0] : undefined;
        const body = head ? rows.slice(1) : rows;
        const tr = (r: DocNode) => `<tr>${(r.content ?? []).map(c => cell(c, c.type === "tableHeader" ? "th" : "td")).join("")}</tr>`;
        return `<div class="table-wrap"><table>${head ? `<thead>${tr(head)}</thead>` : ""}<tbody>${body.map(tr).join("")}</tbody></table></div>`;
      }
      default:
        return "";
    }
  };
  const html = blocks(doc.content);
  return { html, headings };
}
