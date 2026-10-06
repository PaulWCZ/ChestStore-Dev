import { ToastHost } from "@argentic/chest-app/client";
import { ArrivalForm } from "./ArrivalForm.tsx";
import { ArrivalList } from "./ArrivalList.tsx";
import { AutoRefresh } from "./AutoRefresh.tsx";
import { AnswerChange, AskChange } from "./ChangeRequest.tsx";
import { CreateRecord } from "./CreateRecord.tsx";
import { DirectoryView } from "./DirectoryView.tsx";
import { Documents } from "./Documents.tsx";
import { Importer } from "./Importer.tsx";
import { JourneyView } from "./JourneyView.tsx";
import { LettersEditor } from "./LettersEditor.tsx";
import { LinkSuggestion } from "./LinkSuggestion.tsx";
import { MonthsTable } from "./MonthsTable.tsx";
import { OrgChart } from "./OrgChart.tsx";
import { PlacementForm } from "./PlacementForm.tsx";
import { PrintButton } from "./PrintButton.tsx";
import { ProfileForm } from "./ProfileForm.tsx";
import { AddRecord, CreateAll } from "./RecordButtons.tsx";
import { RecordForm } from "./RecordForm.tsx";
import { RecordImporter } from "./RecordImporter.tsx";
import { RegisterTable } from "./RegisterTable.tsx";
import { StartForm } from "./StartForm.tsx";
import { TableEditor } from "./TableEditor.tsx";
import { ExamplesButton, NewTemplate } from "./TemplateButtons.tsx";
import { TemplateEditor } from "./TemplateEditor.tsx";
import { TodoList } from "./TodoList.tsx";

// The components that also run in the browser (islands), by name. A page
// renders one with <Island name="TodoList" props={{…}} />; everything else
// is HTML from the server, with no script. Islands do not nest (an island
// may use another's component: ArrivalList shows ArrivalForm).
export const islands = {
  ToastHost, AutoRefresh, PrintButton,
  DirectoryView, LinkSuggestion, ProfileForm, OrgChart, TodoList,
  ArrivalList, ArrivalForm, ExamplesButton, NewTemplate, StartForm, JourneyView, TemplateEditor,
  Importer, TableEditor,
  CreateRecord, CreateAll, AddRecord, RecordForm, Documents, AskChange, AnswerChange, PlacementForm,
  LettersEditor, RegisterTable, MonthsTable, RecordImporter,
};
