import type { actions } from "./actions.ts";
import type { Catalogue } from "./i18n/index.ts";
import type { islands } from "./islands/index.ts";
import type { LayoutData } from "./layout.tsx";

// What the tool tells @argentic/chest-app about itself: every page,
// action, call() and <Island> is then typed with its words, actions and
// islands; what a page tells the layout (the overdue count on Invoices).
declare module "@argentic/chest-app" {
  interface Register {
    words: Catalogue;
    actions: typeof actions;
    islands: typeof islands;
    layout: LayoutData;
  }
}
