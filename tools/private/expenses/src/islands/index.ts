import { ToastHost } from "@argentic/chest-app/client";
import { ApproveView } from "./ApproveView.tsx";
import { AutoRefresh } from "./AutoRefresh.tsx";
import { CardsView } from "./CardsView.tsx";
import { Compose } from "./Compose.tsx";
import { DetailView } from "./DetailView.tsx";
import { ExportView } from "./ExportView.tsx";
import { HomeView } from "./HomeView.tsx";
import { PayView } from "./PayView.tsx";
import { SearchBox } from "./SearchBox.tsx";
import { CompanyView, MyView } from "./Settings.tsx";
import { SetupBanner } from "./SetupBanner.tsx";

// The components that also run in the browser (islands), by name. A page
// renders one with <Island name="HomeView" props={{…}} />; everything else
// is HTML from the server, with no script. Islands do not nest: each page
// has one view island (its lists, dialogs and toasts' callers) beside the
// small ones (the search box, the timer that re-reads a page).
export const islands = { ToastHost, AutoRefresh, SearchBox, SetupBanner, HomeView, Compose, DetailView, ApproveView, PayView, CardsView, ExportView, MyView, CompanyView };
