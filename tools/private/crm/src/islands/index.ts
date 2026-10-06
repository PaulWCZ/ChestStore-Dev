import { ToastHost } from "@argentic/chest-app/client";
import { DealBoard } from "../components/board.tsx";
import { CallPrompt } from "../components/call-prompt.tsx";
import { CheckList } from "../components/check-list.tsx";
import { CompanyControls } from "../components/company-controls.tsx";
import { NewCompanyButton } from "../components/company-form.tsx";
import { Composer } from "../components/composer.tsx";
import { ContactControls, MaybeSame, PrivacyPanel } from "../components/contact-controls.tsx";
import { NewContactButton } from "../components/contact-form.tsx";
import { DayList, SelfStepButton } from "../components/day-list.tsx";
import { DealControls } from "../components/deal-controls.tsx";
import { DealFilters } from "../components/deal-filters.tsx";
import { NewDealButton } from "../components/deal-form.tsx";
import { FieldsEditor } from "../components/fields-editor.tsx";
import { FilesBox } from "../components/files-box.tsx";
import { Importer, RecentImports } from "../components/importer.tsx";
import { LeadsBox } from "../components/leads-box.tsx";
import { ListFilters } from "../components/list-filters.tsx";
import { StagesEditor } from "../components/stages-editor.tsx";
import { StepBox } from "../components/step-box.tsx";
import { ActivityTable, PipelineTable, ResultsTable } from "../components/team-tables.tsx";
import { Timeline } from "../components/timeline.tsx";
import { CompanyList, ContactList, DealList } from "./lists.tsx";
import { AutoRefresh, HeaderTools, SearchField } from "./shell.tsx";

// The components that also run in the browser (islands), by name. A page
// renders one with <Island name="StepBox" props={{…}} />; everything else
// is HTML from the server, with no script. Islands do not nest; the
// components they are made of live in src/components/.
export const islands = {
  ToastHost, AutoRefresh, HeaderTools, SearchField,
  // My day.
  DayList, SelfStepButton, LeadsBox,
  // New records, anywhere.
  NewDealButton, NewCompanyButton, NewContactButton,
  // Lists.
  DealBoard, DealFilters, DealList, ListFilters, CompanyList, ContactList,
  // A record's page.
  DealControls, CompanyControls, ContactControls, MaybeSame, PrivacyPanel, StepBox, Composer, Timeline, FilesBox, CallPrompt,
  // Team, settings, import.
  PipelineTable, ActivityTable, ResultsTable, StagesEditor, FieldsEditor, CheckList, Importer, RecentImports,
};
