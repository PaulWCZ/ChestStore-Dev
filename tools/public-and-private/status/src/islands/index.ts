import { ToastHost } from "@argentic/chest-app/client";
import { AutoRefresh } from "./AutoRefresh.tsx";
import { ChecksForm } from "./ChecksForm.tsx";
import { ComponentsView } from "./ComponentsView.tsx";
import { HeartbeatsView } from "./HeartbeatsView.tsx";
import { IncidentForm } from "./IncidentForm.tsx";
import { IncidentView } from "./IncidentView.tsx";
import { LocalTimes } from "./LocalTimes.tsx";
import { MaintenanceForm } from "./MaintenanceForm.tsx";
import { MaintenanceView } from "./MaintenanceView.tsx";
import { SettingsView } from "./SettingsView.tsx";
import { SetupEmpty } from "./SetupEmpty.tsx";
import { HookList, SubscriberList } from "./SubscriberList.tsx";

// The components that also run in the browser (islands), by name. A page
// renders one with <Island name="IncidentView" props={{…}} />; everything
// else is HTML from the server, with no script — the public pages carry
// only LocalTimes (times in the visitor's zone) and the toasts. Islands do
// not nest.
export const islands = { ToastHost, AutoRefresh, LocalTimes, SetupEmpty, ComponentsView, ChecksForm, HeartbeatsView, IncidentForm, IncidentView, MaintenanceView, MaintenanceForm, SubscriberList, HookList, SettingsView };
