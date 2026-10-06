import { chestConfig } from "@argentic/chest-app/vite";

// The two builds (the browser's, the server's): @argentic/chest-app/vite.
// No theme here: Booking's look is the company's choice, served at run
// time as a stylesheet (src/theme.ts, createApp's look in src/app.tsx).
export default chestConfig({});
