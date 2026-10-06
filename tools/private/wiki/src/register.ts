import type { actions } from "./actions.ts";
import type { Catalogue } from "./i18n/index.ts";
import type { islands } from "./islands/index.ts";

// What the tool tells @argentic/chest-app about itself: every page,
// action, call() and <Island> is then typed with its words, actions and
// islands. Nothing to change here.
declare module "@argentic/chest-app" {
  interface Register {
    words: Catalogue;
    actions: typeof actions;
    islands: typeof islands;
    // What a page tells the layout (src/frame.tsx): whether Trash shows.
    layout: { trash: boolean };
  }
}
