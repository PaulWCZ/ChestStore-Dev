import { ToastHost } from "@argentic/chest-app/client";
import { AddForm } from "./AddForm.tsx";
import { ApplyForm } from "./ApplyForm.tsx";
import { AutoRefresh } from "./AutoRefresh.tsx";
import { BoardView } from "./BoardView.tsx";
import { CandidateActions } from "./CandidateActions.tsx";
import { FeedbackForm } from "./FeedbackForm.tsx";
import { ImportView } from "./ImportView.tsx";
import { Interviews } from "./Interviews.tsx";
import { JobActions } from "./JobActions.tsx";
import { JobForm } from "./JobForm.tsx";
import { JobSettingsView } from "./JobSettingsView.tsx";
import { Notes } from "./Notes.tsx";
import { SearchBox } from "./SearchBox.tsx";
import { SettingsView } from "./SettingsView.tsx";
import { TimePicker } from "./TimePicker.tsx";

// The components that also run in the browser (islands), by name. A page
// renders one with <Island name="BoardView" props={{…}} />; everything else
// is HTML from the server, with no script. Islands do not nest.
export const islands = {
  ToastHost, AutoRefresh, SearchBox,
  // The careers page (public).
  ApplyForm, TimePicker,
  // The team's pages.
  JobActions, BoardView, JobForm, JobSettingsView, AddForm, ImportView,
  CandidateActions, FeedbackForm, Interviews, Notes, SettingsView,
};
