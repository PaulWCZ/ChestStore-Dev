import { mergeAttributes, Node } from "@tiptap/core";
import Image from "@tiptap/extension-image";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { TableKit } from "@tiptap/extension-table";
import { Placeholder } from "@tiptap/extensions";
import StarterKit from "@tiptap/starter-kit";
import { safeHref, tones } from "../../../../../lib/doc.ts";

// The editor's schema: exactly the nodes and marks lib/doc.ts keeps on the
// server (the server checks again whatever comes). Two nodes are the
// wiki's own: the note box (callout) and the link to a page (pageRef),
// which shows the page's current title.

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    callout: {
      toggleCallout: (tone?: string) => ReturnType;
      setCalloutTone: (tone: string) => ReturnType;
    };
    pageRef: {
      insertPageRef: (id: string) => ReturnType;
    };
  }
}

export const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,
  addAttributes() {
    return {
      tone: {
        default: "info",
        parseHTML: element => element.getAttribute("data-tone") ?? "info",
        renderHTML: attributes => ({ "data-tone": attributes["tone"], class: `callout ${(tones as readonly string[]).includes(attributes["tone"]) ? attributes["tone"] : "info"}` }),
      },
    };
  },
  parseHTML() {
    return [{ tag: "aside[data-tone]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["aside", mergeAttributes(HTMLAttributes, { role: "note" }), 0];
  },
  addCommands() {
    return {
      toggleCallout: (tone = "info") => ({ commands }) => commands.toggleWrap(this.name, { tone }),
      setCalloutTone: tone => ({ commands }) => commands.updateAttributes(this.name, { tone }),
    };
  },
});

export const PageRef = Node.create<{ title: (id: string) => string }>({
  name: "pageRef",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,
  addOptions() {
    return { title: (id: string) => id };
  },
  addAttributes() {
    return { id: { default: null, parseHTML: element => element.getAttribute("data-page-ref") } };
  },
  parseHTML() {
    return [{ tag: "a[data-page-ref]" }];
  },
  renderHTML({ node }) {
    const id = String(node.attrs["id"] ?? "");
    return ["a", { href: `/chest/pages/${id}`, "data-page-ref": id, class: "page-ref" }, this.options.title(id)];
  },
  renderText({ node }) {
    return this.options.title(String(node.attrs["id"] ?? ""));
  },
  addCommands() {
    return {
      insertPageRef: id => ({ chain }) => chain().insertContent([{ type: this.name, attrs: { id } }, { type: "text", text: " " }]).run(),
    };
  },
});

export function extensions(options: { placeholder: string; title: (id: string) => string }) {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      link: {
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        defaultProtocol: "https",
        isAllowedUri: url => safeHref(url) !== null,
        HTMLAttributes: { rel: "noopener noreferrer nofollow", target: null },
      },
      codeBlock: { HTMLAttributes: { spellcheck: "false" } },
    }),
    Image.configure({ inline: false, allowBase64: false }),
    TableKit.configure({ table: { resizable: false } }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Placeholder.configure({ placeholder: options.placeholder }),
    Callout,
    PageRef.configure({ title: options.title }),
  ];
}
