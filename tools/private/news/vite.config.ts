import { chestConfig } from "@argentic/chest-app/vite";

// The two builds (the browser's, the server's): @argentic/chest-app/vite.
// No theme built in: the look is the company's choice, served at run time
// (src/theme.ts). The editor (Tiptap) is the browser's alone — a chunk of
// its own, fetched by the composer (src/islands/TextEditor.tsx).
export default chestConfig({});
