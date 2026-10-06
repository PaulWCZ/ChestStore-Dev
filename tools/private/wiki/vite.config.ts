import { chestConfig } from "@argentic/chest-app/vite";

// The two builds (the browser's, the server's): @argentic/chest-app/vite.
// No theme built in: the look is the company's choice, served at run time
// (src/theme.ts). The editor (Tiptap) is the browser's alone — a chunk of
// its own, fetched when the editor opens (src/islands/Editor.tsx). The
// server bundles what imports and exports read (markdown-it, htmlparser2,
// diff, with their own packages): less memory, a faster start.
export default chestConfig({
  bundle: ["markdown-it", "linkify-it", "mdurl", "uc.micro", "punycode.js", "entities", "htmlparser2", "domhandler", "domutils", "dom-serializer", "domelementtype", "diff"],
});
