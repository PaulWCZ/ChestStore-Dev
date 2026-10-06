import { ToastHost } from "@argentic/chest-app/client";
import { Approvals } from "./Approvals.tsx";
import { AutoRefresh } from "./AutoRefresh.tsx";
import { Importer } from "./Importer.tsx";
import { MyRequests } from "./MyRequests.tsx";
import { OnDay, OnMonth } from "./OnDay.tsx";
import { ApproverPicker, GiveEveryone } from "./PeopleControls.tsx";
import { PeopleTable } from "./PeopleTable.tsx";
import { BalanceForms, DayField, NumberField, WorkWeek } from "./PersonControls.tsx";
import { RequestActions } from "./RequestActions.tsx";
import { RequestForm } from "./RequestForm.tsx";
import { SettingsView } from "./SettingsView.tsx";

// The components that also run in the browser (islands), by name. A page
// renders one with <Island name="RequestForm" props={{…}} />; everything
// else is HTML from the server, with no script. Islands do not nest (a
// component an island uses — the kit's date field, its people picker — is
// just a component inside it).
export const islands = {
  ToastHost, AutoRefresh,
  // Home and requests.
  MyRequests, RequestForm, RequestActions, Approvals,
  // People (HR and approvers).
  PeopleTable, GiveEveryone, ApproverPicker, DayField, NumberField, WorkWeek, BalanceForms, Importer, OnDay, OnMonth,
  // Settings (HR).
  SettingsView,
};
