import { ToastHost } from "@argentic/chest-app/client";
import { AutoRefresh } from "./AutoRefresh.tsx";
import { DeleteNote } from "./DeleteNote.tsx";

// The components that also run in the browser (islands), by name. A page
// renders one with <Island name="DeleteNote" props={{…}} />; everything
// else is HTML from the server, with no script. Islands do not nest.
export const islands = { ToastHost, DeleteNote, AutoRefresh };
