import { chestConfig } from "@argentic/chest-app/vite";

// The two builds (the browser's, the server's): @argentic/chest-app/vite.
// No theme built in: the look is the company's choice, else Goals' own
// Trail map, served at run time as a stylesheet of its own (src/theme.ts,
// createApp's look).
export default chestConfig({});
