import type { actions } from "./actions.ts";
import type { Catalogue } from "./i18n/index.ts";
import type { islands } from "./islands/index.ts";

// What Forms tells @argentic/chest-app about itself: every page, action,
// call() and <Island> is then typed with its words, actions and islands.
// A page tells the layout two things (src/layout.tsx): whether the page
// wears Forms' own look (a form's colours then keep their soft grounds:
// src/tokens.css) and whether it is a respondent's page (a team form,
// drawn as its respondents see it, without the tool's bar).
declare module "@argentic/chest-app" {
  interface Register {
    words: Catalogue;
    actions: typeof actions;
    islands: typeof islands;
    layout: { own: boolean; respond: boolean };
  }
}
