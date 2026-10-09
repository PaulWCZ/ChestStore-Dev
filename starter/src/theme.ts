import { themeOf } from "@argentic/chest-ui/themes";

// The tool's look: a theme of @argentic/chest-ui, built into the stylesheet
// (vite.config.ts). "chest" is the Chest's own sheet: black and white,
// light only. Another of the catalogue: themeOf("workshop"), "library"…;
// a look of the tool's own: defineTheme({...}) from "@argentic/chest-ui",
// its fonts as files in public/assets/fonts/. test/units.test.ts checks it.
export const identity = themeOf("chest")!;
