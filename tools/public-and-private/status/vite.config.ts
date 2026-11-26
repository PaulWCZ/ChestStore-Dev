import { chestConfig } from "@argentic/chest-app/vite";

// The two builds (the browser's, the server's): @argentic/chest-app/vite.
// No theme here: Status's look is the company's choice, read at each
// request and served as a stylesheet of its own (src/lib/theme.ts,
// createApp's look).
export default chestConfig({});
