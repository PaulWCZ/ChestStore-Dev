import { ToastHost } from "@argentic/chest-app/client";
import { AnswerForm } from "./AnswerForm.tsx";
import { BankView } from "./BankView.tsx";
import { CatalogueView } from "./CatalogueView.tsx";
import { ClientsView } from "./ClientsView.tsx";
import { ClientView } from "./ClientView.tsx";
import { DocTable } from "./DocTable.tsx";
import { DocumentView } from "./document/DocumentView.tsx";
import { Importer } from "./Importer.tsx";
import { MoreMenu } from "./MoreMenu.tsx";
import { NewDocument } from "./NewDocument.tsx";
import { NumberingPanel } from "./NumberingPanel.tsx";
import { PeriodForm } from "./PeriodForm.tsx";
import { SearchField } from "./SearchField.tsx";
import { SettingsView } from "./SettingsView.tsx";

// The components that also run in the browser (islands), by name. A page
// renders one with <Island name="DocumentView" props={{…}} />; everything
// else is HTML from the server, with no script. Islands do not nest (a
// component an island uses — the client form, the pickers, the dialogs —
// is just a component inside it).
export const islands = {
  ToastHost, MoreMenu, NewDocument, DocTable, SearchField,
  // The team's part.
  DocumentView, ClientsView, ClientView, CatalogueView, SettingsView, NumberingPanel, Importer, BankView, PeriodForm,
  // The public part.
  AnswerForm,
};
