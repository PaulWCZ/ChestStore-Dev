import type { actions } from "./actions.ts";
import type { Catalogue } from "./i18n/index.ts";
import type { islands } from "./islands/index.ts";
import type { TimerProps } from "./islands/TimerBar.tsx";

// What the tool tells @argentic/chest-app about itself: every page,
// action, call() and <Island> is then typed with its words, actions and
// islands. layout: what a page tells the layout around it — the timer on
// top of every page of a member (src/timer-view.ts), absent on an error
// page.
declare module "@argentic/chest-app" {
  interface Register {
    words: Catalogue;
    actions: typeof actions;
    islands: typeof islands;
    layout: { timer: TimerProps | null };
  }
}
