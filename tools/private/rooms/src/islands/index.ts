import { ToastHost } from "@argentic/chest-app/client";
import { DayPicker } from "../components/day-picker.tsx";
import { ExampleButton } from "../components/example-office.tsx";
import { OfficePicker } from "../components/office-picker.tsx";
import { AutoRefresh } from "./AutoRefresh.tsx";
import { BookFor } from "./BookFor.tsx";
import { DeskView } from "./DeskView.tsx";
import { Period } from "./Period.tsx";
import { PlacesView } from "./PlacesView.tsx";
import { RoomsView } from "./RoomsView.tsx";
import { RulesForm } from "./RulesForm.tsx";
import { Search } from "./Search.tsx";
import { VisitorsView } from "./VisitorsView.tsx";
import { WeekView } from "./WeekView.tsx";

// The components that also run in the browser (islands), by name. A page
// renders one with <Island name="WeekView" props={{…}} />; everything else
// is HTML from the server, with no script. Islands do not nest (a
// component an island uses — the day strip, the office picker — is just a
// component inside it; the same components stand alone as islands on the
// pages that need only them).
export const islands = {
  ToastHost, AutoRefresh, DayPicker, OfficePicker, ExampleButton, Search,
  // My week.
  WeekView,
  // Desks, rooms, visitors.
  DeskView, BookFor, RoomsView, VisitorsView,
  // Places (admins).
  PlacesView, RulesForm, Period,
};
