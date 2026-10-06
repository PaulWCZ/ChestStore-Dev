import { ToastHost } from "@argentic/chest-app/client";
import { AnswerActions, FollowUp } from "./AnswerActions.tsx";
import { AnswersFilters } from "./AnswersFilters.tsx";
import { AnswersTable } from "./AnswersTable.tsx";
import { AutoRefresh } from "./AutoRefresh.tsx";
import { Builder } from "./Builder.tsx";
import { ColumnsPick } from "./ColumnsPick.tsx";
import { DeletedToast } from "./DeletedToast.tsx";
import { EraseForm } from "./EraseForm.tsx";
import { EveryoneSwitch } from "./EveryoneSwitch.tsx";
import { FormTitle } from "./FormTitle.tsx";
import { ImportForm } from "./ImportForm.tsx";
import { KeepInView } from "./KeepInView.tsx";
import { Picker } from "./Picker.tsx";
import { Runner } from "./Runner.tsx";
import { Search } from "./Search.tsx";
import { Settings } from "./Settings.tsx";
import { Share } from "./Share.tsx";
import { StartButtons } from "./StartButtons.tsx";
import { StatusControl } from "./StatusControl.tsx";

// The components that also run in the browser (islands), by name. A page
// renders one with <Island name="Runner" props={{…}} />; everything else
// is HTML from the server, with no script. Islands do not nest.
export const islands = { ToastHost, AutoRefresh, Search, DeletedToast, EveryoneSwitch, StartButtons, Picker, ImportForm, EraseForm, FormTitle, KeepInView, StatusControl, Builder, Share, Settings, AnswersFilters, ColumnsPick, AnswersTable, AnswerActions, FollowUp, Runner };
