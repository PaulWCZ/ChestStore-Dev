import { safeHref, safeImage } from "../../../../../lib/doc.ts";

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
  | { kind: "web"; href: string | null };

// pictureOf says what a pasted picture's address is. `origin` is the
// wiki's own address (window.location.origin).
export function pictureOf(src: string, origin: string): Picture {
  const value = src.trim();
  const own = safeImage(value);
  if (own) return { kind: "ours", src: own };
  const inside = /^data:(image\/(?:png|jpeg|gif|webp));base64,([A-Za-z0-9+/=\s]+)$/iu.exec(value);
  if (inside) return { kind: "inside", type: inside[1]!.toLowerCase(), data: inside[2]!.replace(/\s+/gu, "") };
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

// pastedPictures rewrites pasted HTML (in the browser): our pictures keep
// a relative address, pictures from the web become a warning note with the
// words given (`note(alt)` → the sentence; `open` → the link's words), and
// pictures inside the clipboard are taken out and answered as files.
export function pastedPictures(html: string, origin: string, words: { note: (alt: string) => string; open: string; name: string }): { html: string; web: number; files: File[] } {
  if (!/<img[\s>]/iu.test(html)) return { html, web: 0, files: [] };
  const dom = new DOMParser().parseFromString(html, "text/html");
  let web = 0;
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
    web++;
    const alt = (img.getAttribute("alt") ?? "").replace(/\s+/gu, " ").trim().slice(0, 120);
    const aside = dom.createElement("aside");
    aside.setAttribute("data-tone", "warning");
    const p = dom.createElement("p");
    p.append(dom.createTextNode(words.note(alt)));
    if (picture.href) {
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
  return { html: dom.body.innerHTML, web, files };
}
