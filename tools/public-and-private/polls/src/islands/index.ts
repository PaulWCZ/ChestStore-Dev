import { ToastHost } from "../core/client.tsx";
import { AnswerArea } from "./AnswerArea.tsx";
import { AutoRefresh } from "./AutoRefresh.tsx";
import { Comments } from "./Comments.tsx";
import { Composer } from "./Composer.tsx";
import { GuestForm } from "./GuestForm.tsx";
import { GuestsCard } from "./GuestsCard.tsx";
import { FinalPicker, Manage } from "./Manage.tsx";
import { PolicySwitch } from "./PolicySwitch.tsx";
import { MyReplies, ReplyThread } from "./Replies.tsx";

// The components that also run in the browser (islands), by name. A page
// renders one with <Island name="AnswerArea" props={{…}} />; everything
// else is HTML from the server, with no script. Islands do not nest.
export const islands = { ToastHost, AutoRefresh, PolicySwitch, Composer, AnswerArea, Manage, FinalPicker, Comments, GuestsCard, ReplyThread, MyReplies, GuestForm };
