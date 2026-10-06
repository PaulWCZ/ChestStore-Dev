import { ToastHost } from "@argentic/chest-app/client";
import { AutoRefresh } from "./AutoRefresh.tsx";
import { Comments } from "./Comments.tsx";
import { Composer } from "./Composer.tsx";
import { Decide } from "./Decide.tsx";
import { DigestSwitch } from "./DigestSwitch.tsx";
import { AnsweredNotice, ConfirmBox, PostTools, Reactions, RemindButton, Rsvp, SendingNotice } from "./Post.tsx";
import { ProposeForm, TakeBack } from "./Propose.tsx";
import { Ready, Search } from "./Search.tsx";
import { SlackImport } from "./SlackImport.tsx";

// The components that also run in the browser (islands), by name. A page
// renders one with <Island name="Rsvp" props={{…}} />; everything else is
// HTML from the server, with no script. Islands do not nest.
export const islands = { ToastHost, Ready, Search, AutoRefresh, DigestSwitch, PostTools, ConfirmBox, SendingNotice, Rsvp, Reactions, RemindButton, AnsweredNotice, Comments, Composer, ProposeForm, TakeBack, Decide, SlackImport };
