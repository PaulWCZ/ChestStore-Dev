import { chestConfig } from "@argentic/chest-app/vite";

// The two builds (the browser's, the server's): @argentic/chest-app/vite.
// No theme built in: the look is the company's choice, else Receipt,
// served at run time (src/theme.ts, createApp's look). The receipt reader
// (tesseract.js) is the browser's alone, a chunk of its own fetched when a
// photo is picked (src/components/ocr.ts); its worker, core and model are
// copied into dist/ocr by scripts/ocr-assets.mjs and served at /chest/ocr/.
export default chestConfig({});
