import { chestConfig } from "@argentic/chest-app/vite";

// The two builds (the browser's, the server's): @argentic/chest-app/vite.
// No theme built in: the look is the company's choice, served at run time
// (src/theme.ts, createApp's look). dnd-kit (the deal board's drag and
// drop) is bundled into the server too.
export default chestConfig({ bundle: ["@dnd-kit/core", "@dnd-kit/sortable", "@dnd-kit/utilities", "@dnd-kit/accessibility", "tslib"] });
