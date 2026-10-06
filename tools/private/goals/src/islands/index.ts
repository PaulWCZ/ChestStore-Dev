import { ToastHost } from "@argentic/chest-app/client";
import { AddKeyResult } from "../components/key-result-dialog.tsx";
import { AddExample } from "./AddExample.tsx";
import { AutoRefresh } from "./AutoRefresh.tsx";
import { CloseCycle } from "./CloseCycle.tsx";
import { Comments } from "./Comments.tsx";
import { CompanyTools } from "./CompanyTools.tsx";
import { CycleAdmin, NewCycle } from "./CycleAdmin.tsx";
import { ImportView } from "./ImportView.tsx";
import { KeyResultCard } from "./KeyResultCard.tsx";
import { ObjectiveActions } from "./ObjectiveActions.tsx";
import { ObjectiveForm } from "./ObjectiveForm.tsx";
import { Remind, RemindAll } from "./Remind.tsx";
import { Retro } from "./Retro.tsx";
import { SettingsView } from "./SettingsView.tsx";
import { StartCycle } from "./StartCycle.tsx";
import { WaitingList } from "./WaitingList.tsx";

// The components that also run in the browser (islands), by name. A page
// renders one with <Island name="WaitingList" props={{…}} />; everything
// else is HTML from the server, with no script (the company's tree folds
// with the browser's own <details>). Islands do not nest.
export const islands = {
  ToastHost, AutoRefresh,
  WaitingList, StartCycle, AddExample,
  CompanyTools, Remind, RemindAll,
  KeyResultCard, AddKeyResult, ObjectiveActions, Retro, Comments, ObjectiveForm,
  NewCycle, CycleAdmin, CloseCycle,
  SettingsView, ImportView,
};
