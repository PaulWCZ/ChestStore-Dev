import { chestConfig } from "@argentic/chest-app/vite";

// The two builds (the browser's, the server's): @argentic/chest-app/vite.
// No theme here: Hiring's look is the company's choice (or its own, in the
// careers page's colour), served at run time as a stylesheet (src/theme.ts,
// createApp's look in src/app.tsx). The drag and drop of the board is
// bundled with the browser's files.
export default chestConfig({});
