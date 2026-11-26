import { safeHref, safeImage, unwrapRedirect } from "../../shared/doc.ts";

// Pictures in what a person pastes or drops (a Google Doc, a web page, an
// email): the wiki shows its own files only and has no network, so a
// picture from the web cannot be kept, nor fetched. Nothing may vanish
// silently, so each one becomes a warning note in its place, with a link to
// the picture: download it, drop it there. A picture of this wiki (copied
// from another page, written with the full address) stays; a picture
// carried inside the clipboard (a data: address) is sent to the Chest like
// a pasted file.

export type Picture =
  | { kind: "ours"; src: string }
  | { kind: "inside"; type: string; data: string }
  // A file of the computer (Word desktop writes its pictures so, and puts
  // the pictures themselves in the clipboard beside the HTML).
  | { kind: "local" }
  | { kind: "web"; href: string | null };

// pictureOf says what a pasted picture's address is. `origin` is the
// wiki's own address (window.location.origin).
export function pictureOf(src: string, origin: string): Picture {
  const value = src.trim();
  const own = safeImage(value);
  if (own) return { kind: "ours", src: own };
  const inside = /^data:(image\/(?:png|jpeg|gif|webp));base64,([A-Za-z0-9+/=\s]+)$/iu.exec(value);
  if (inside) return { kind: "inside", type: inside[1]!.toLowerCase(), data: inside[2]!.replace(/\s+/gu, "") };
  if (/^file:/iu.test(value)) return { kind: "local" };
  try {
    const url = new URL(value, origin);
    if (url.origin === origin) {
      const same = safeImage(url.pathname);
      if (same && url.search === "" && url.hash === "") return { kind: "ours", src: same };
    }
  } catch {
    // Not an address at all: a note without a link.
  }
  const href = safeHref(value);
  return { kind: "web", href: href && /^https?:/iu.test(href) ? href : null };
}

// fileOf turns a picture carried in the clipboard into a file to upload.
export function fileOf(p: Extract<Picture, { kind: "inside" }>, name: string): File {
  const bytes = Uint8Array.from(atob(p.data), c => c.charCodeAt(0));
  const extension = p.type === "image/jpeg" ? "jpg" : p.type.slice("image/".length);
  return new File([bytes], `${name}.${extension}`, { type: p.type });
}

// pastedPictures rewrites pasted HTML (in the browser): Word's lists become
// lists, styles their marks, Google's redirects the links they lead to; our
// pictures keep a relative address, pictures from the web become a warning
// note with the words given (`note(alt)` → the sentence; `open` → the
// link's words), pictures inside the clipboard are taken out and answered
// as files. A picture that is a file of the computer (Word desktop) is
// taken out when the clipboard carries pictures (`clipboardPictures`: the
// editor uploads those in its place; `local` counts them), else noted.
// text: whether the paste holds words (not only pictures).
export function pastedPictures(html: string, origin: string, words: { note: (alt: string) => string; open: string; name: string }, clipboardPictures = 0): { html: string; web: number; local: number; files: File[]; text: boolean } {
  const dom = new DOMParser().parseFromString(unstyled(html), "text/html");
  wordLists(dom);
  inlineStyles(dom);
  for (const a of [...dom.querySelectorAll("a[href]")]) a.setAttribute("href", unwrapRedirect(a.getAttribute("href") ?? ""));
  let web = 0;
  let local = 0;
  const files: File[] = [];
  for (const img of [...dom.querySelectorAll("img")]) {
    const picture = pictureOf(img.getAttribute("src") ?? "", origin);
    if (picture.kind === "ours") {
      img.setAttribute("src", picture.src);
      continue;
    }
    if (picture.kind === "inside") {
      files.push(fileOf(picture, `${words.name} ${files.length + 1}`));
      img.remove();
      continue;
    }
    if (picture.kind === "local" && local < clipboardPictures) {
      local++;
      img.remove();
      continue;
    }
    web++;
    const alt = (img.getAttribute("alt") ?? "").replace(/\s+/gu, " ").trim().slice(0, 120);
    const aside = dom.createElement("aside");
    aside.setAttribute("data-tone", "warning");
    const p = dom.createElement("p");
    p.append(dom.createTextNode(words.note(alt)));
    if (picture.kind === "web" && picture.href) {
      p.append(dom.createTextNode(" "));
      const a = dom.createElement("a");
      a.setAttribute("href", picture.href);
      a.textContent = words.open;
      p.append(a);
    }
    aside.append(p);
    // A note is a block: it takes the place of the picture's paragraph when
    // the picture was alone in it, else it follows that paragraph.
    const block = img.closest("p, h1, h2, h3, h4, h5, h6");
    if (block && block.textContent?.trim() === "" && block.querySelectorAll("img").length === 1) block.replaceWith(aside);
    else if (block) {
      img.remove();
      block.after(aside);
    } else img.replaceWith(aside);
  }
  return { html: dom.body.innerHTML, web, local, files, text: (dom.body.textContent ?? "").replace(/\s+/gu, "") !== "" };
}

// Word's lists (Word desktop, Outlook) are paragraphs that look like a list
// — class MsoListParagraph, style "mso-list: l0 level2 lfo1", the bullet or
// number written in a span marked "mso-list: Ignore" — not lists: they
// become lists again, nested by their level, numbered when the marker is
// a number or a letter ("1.", "a)"), the written markers dropped.
export function wordLists(dom: Document): void {
  type Item = { p: HTMLElement; level: number; ordered: boolean };
  const items: Item[] = [];
  for (const p of [...dom.body.querySelectorAll<HTMLElement>("p")]) {
    const style = p.getAttribute("data-pasted-style") ?? "";
    const level = /mso-list:\s*\S+\s+level(\d+)/iu.exec(style)?.[1];
    if (level === undefined && !/MsoListParagraph/u.test(p.className)) continue;
    const marker = p.querySelector('[data-pasted-style*="mso-list:Ignore" i], [data-pasted-style*="mso-list: Ignore" i]');
    const written = (marker?.textContent ?? "").replace(/[\s\u00a0]+/gu, "");
    marker?.remove();
    items.push({ p, level: Math.min(Math.max(Number(level ?? 1), 1), 6), ordered: /^\(?[0-9a-zA-Z]{1,4}[.)]$/u.test(written) });
  }
  for (let i = 0; i < items.length; ) {
    // A run: list paragraphs one after another.
    let end = i + 1;
    while (end < items.length && items[end - 1]!.p.nextElementSibling === items[end]!.p) end++;
    const run = items.slice(i, end);
    const stack: { list: HTMLElement; level: number }[] = [];
    const listFor = (item: Item) => dom.createElement(item.ordered ? "ol" : "ul");
    const top = listFor(run[0]!);
    run[0]!.p.before(top);
    stack.push({ list: top, level: run[0]!.level });
    for (const item of run) {
      while (stack.length > 1 && item.level < stack.at(-1)!.level) stack.pop();
      if (item.level > stack.at(-1)!.level) {
        const parent = stack.at(-1)!.list.lastElementChild ?? stack.at(-1)!.list.appendChild(dom.createElement("li"));
        const inner = listFor(item);
        parent.append(inner);
        stack.push({ list: inner, level: item.level });
      }
      const li = dom.createElement("li");
      const para = dom.createElement("p");
      para.append(...item.p.childNodes);
      li.append(para);
      stack.at(-1)!.list.append(li);
      item.p.remove();
    }
    i = end;
  }
}

// What a style attribute says that the page keeps — bold, italic, struck
// through (Google Docs writes them so) — becomes the element that says it,
// and the attribute goes. The page's policy refuses style attributes
// wherever HTML is parsed in it (a DOMParser's document too: it says so in
// the console, and the styles do not read), so they are renamed in the
// text first, and style elements taken out (unstyled) and read by hand here. Google Docs' wrapper
// <b style="font-weight: normal"> is not bold: it gives its children back.
export function unstyled(html: string): string {
  // A style element (Word's head holds one) is refused the same way: out.
  return html.replace(/<style[\s>][\s\S]*?<\/style\s*>/giu, "").replace(/<[a-z][^>]*>/giu, tag => tag.replace(/\sstyle\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/giu, " data-pasted-style=$1"));
}

function declarations(text: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const part of text.split(";")) {
    const at = part.indexOf(":");
    if (at > 0) found.set(part.slice(0, at).trim().toLowerCase(), part.slice(at + 1).trim().toLowerCase());
  }
  return found;
}

export function inlineStyles(dom: Document): void {
  for (const el of [...dom.body.querySelectorAll<HTMLElement>("[data-pasted-style]")]) {
    const style = declarations(el.getAttribute("data-pasted-style") ?? "");
    el.removeAttribute("data-pasted-style");
    const weight = style.get("font-weight") ?? "";
    const bold = weight === "bold" || weight === "bolder" || Number(weight) >= 600;
    const plain = weight === "normal" || (weight !== "" && Number(weight) > 0 && Number(weight) < 600);
    const italic = style.get("font-style") === "italic";
    const struck = /line-through/u.test(style.get("text-decoration") ?? style.get("text-decoration-line") ?? "");
    if (plain && (el.localName === "b" || el.localName === "strong")) {
      el.replaceWith(...el.childNodes);
      continue;
    }
    const wraps = [bold && !["b", "strong", "h1", "h2", "h3", "h4", "h5", "h6"].includes(el.localName) ? "strong" : null, italic && el.localName !== "em" && el.localName !== "i" ? "em" : null, struck && el.localName !== "s" ? "s" : null].filter((w): w is string => w !== null);
    for (const tag of wraps) {
      const wrap = dom.createElement(tag);
      wrap.append(...el.childNodes);
      el.append(wrap);
    }
  }
}
