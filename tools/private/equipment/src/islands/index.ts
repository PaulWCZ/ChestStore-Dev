import { ToastHost } from "@argentic/chest-app/client";
import { AskButton } from "./AskButton.tsx";
import { CategoriesView } from "./CategoriesView.tsx";
import { ClaimButton } from "./ClaimButton.tsx";
import { Importer } from "./Importer.tsx";
import { InventoryView } from "./InventoryView.tsx";
import { InvoiceControl } from "./InvoiceControl.tsx";
import { ItemControls } from "./ItemControls.tsx";
import { ItemForm } from "./ItemForm.tsx";
import { ItemsView } from "./ItemsView.tsx";
import { MyRequests } from "./MyRequests.tsx";
import { PeopleView } from "./PeopleView.tsx";
import { PersonView } from "./PersonView.tsx";
import { PhotoControl } from "./PhotoControl.tsx";
import { PrintButton } from "./PrintButton.tsx";
import { ReceiveButton } from "./ReceiveButton.tsx";
import { RemindButton } from "./RemindButton.tsx";
import { ReportButton } from "./ReportButton.tsx";
import { RequestsPanel } from "./RequestsPanel.tsx";
import { RulesView } from "./RulesView.tsx";
import { SearchBox } from "./SearchBox.tsx";
import { SolveButton } from "./SolveButton.tsx";

// The components that also run in the browser (islands), by name. A page
// renders one with <Island name="ItemControls" props={{…}} />; everything
// else is HTML from the server, with no script. Islands do not nest.
export const islands = {
  ToastHost, SearchBox, PrintButton,
  // My equipment, an item's short view
  AskButton, MyRequests, ReceiveButton, ReportButton,
  // The overview
  RequestsPanel, RemindButton, SolveButton,
  // The list, an item's page and form
  ItemsView, ItemControls, ItemForm, PhotoControl, InvoiceControl, ClaimButton,
  // People, inventory, import, settings
  PeopleView, PersonView, InventoryView, Importer, CategoriesView, RulesView,
};
