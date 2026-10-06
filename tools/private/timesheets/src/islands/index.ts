import { ToastHost } from "@argentic/chest-app/client";
import { AutoRefresh } from "./AutoRefresh.tsx";
import { AutoSubmit } from "./AutoSubmit.tsx";
import { ClientsView, ExampleButton } from "./Clients.tsx";
import { Importer } from "./Importer.tsx";
import { MarkInvoiced } from "./MarkInvoiced.tsx";
import { FormerList, PeopleList } from "./People.tsx";
import { PersonRates } from "./PersonRates.tsx";
import { ProjectForm, TasksEditor } from "./ProjectForm.tsx";
import { QuotesPanel } from "./QuotesPanel.tsx";
import { GroupChoice, LinesTable, NoteSearch, RangeFields } from "./ReportViews.tsx";
import { SettingsView } from "./SettingsView.tsx";
import { ApproveAll, Decision, RemindButton, TeamTable, WaitingList } from "./Team.tsx";
import { TimerBar } from "./TimerBar.tsx";
import { WeekView } from "./WeekView.tsx";

// The components that also run in the browser (islands), by name. A page
// renders one with <Island name="WeekView" props={{…}} />; everything else
// is HTML from the server, with no script. Islands do not nest (a component
// an island uses — the project picker, the day's list, the kit's date
// field — is just a component inside it).
export const islands = {
  // The layout: the toasts, the timer on every page, the page read again.
  ToastHost, TimerBar, AutoRefresh,
  // My week.
  WeekView,
  // Team (managers).
  WaitingList, Decision, ApproveAll, RemindButton, TeamTable,
  // People: rates, usual weeks, former people.
  PeopleList, FormerList,
  // Projects and clients.
  ExampleButton, ClientsView, ProjectForm, TasksEditor, PersonRates,
  // Reports.
  AutoSubmit, GroupChoice, RangeFields, NoteSearch, LinesTable, MarkInvoiced, QuotesPanel,
  // Settings and import.
  SettingsView, Importer,
};
