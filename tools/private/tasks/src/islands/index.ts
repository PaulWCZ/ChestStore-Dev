import { ToastHost } from "@argentic/chest-app/client";
import { AutoRefresh } from "./AutoRefresh.tsx";
import { BoardSettings } from "./BoardSettings.tsx";
import { BoardView } from "./BoardView.tsx";
import { CardPanel } from "./CardPanel.tsx";
import { Importer } from "./Importer.tsx";
import { NewBoard } from "./NewBoard.tsx";
import { SearchBox } from "./SearchBox.tsx";
import { ReminderSwitch } from "./Switches.tsx";
import { TaskGroups } from "./TaskGroups.tsx";

// The components that also run in the browser (islands), by name. A page
// renders one with <Island name="BoardView" props={{…}} />; everything
// else is HTML from the server, with no script. Islands do not nest. The
// board's views (list, calendar, timeline) live inside BoardView.
export const islands = { ToastHost, AutoRefresh, SearchBox, TaskGroups, NewBoard, ReminderSwitch, BoardView, CardPanel, BoardSettings, Importer };
