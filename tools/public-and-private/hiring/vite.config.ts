import { chestConfig } from "@argentic/chest-app/vite";

// The two builds (the browser's, the server's): @argentic/chest-app/vite.
// No theme here: Hiring's look is the company's choice (or its own, in the
// careers page's colour), served at run time as a stylesheet (src/theme.ts,
// createApp's look in src/app.tsx). dnd-kit (the board's drag and drop) is
// bundled into the server too, with the one React the pages render with.
export default chestConfig({ bundle: ["@dnd-kit/core", "@dnd-kit/utilities", "@dnd-kit/accessibility", "tslib"] });
