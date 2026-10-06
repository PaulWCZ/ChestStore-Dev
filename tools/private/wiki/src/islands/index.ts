import { ToastHost } from "@argentic/chest-app/client";
import { ExampleButton, LinkMenu, NewPageButton, NewSpaceButton } from "./Buttons.tsx";
import { Comments } from "./Comments.tsx";
import { Editor } from "./Editor.tsx";
import { ReadsActions, RestoreButton } from "./History.tsx";
import { Importer } from "./Importer.tsx";
import { AutoRefresh, Flash, Ready, Search } from "./Page.tsx";
import { DraftNotice, PageActions, ReadRequest, ReviewAsk } from "./PageActions.tsx";
import { Contents, Sidebar } from "./Sidebar.tsx";
import { SpaceSettings } from "./SpaceSettings.tsx";
import { SynonymsEditor } from "./SynonymsEditor.tsx";
import { TrashRow } from "./TrashRow.tsx";

// The components that also run in the browser (islands), by name. A page
// renders one with <Island name="PageActions" props={{…}} />; everything
// else is HTML from the server, with no script. Islands do not nest.
export const islands = {
  ToastHost, Ready, Search, AutoRefresh, Flash,
  Sidebar, Contents, NewPageButton, NewSpaceButton, ExampleButton, LinkMenu,
  PageActions, ReviewAsk, DraftNotice, ReadRequest, Comments,
  Editor, RestoreButton, ReadsActions, SynonymsEditor, TrashRow, Importer, SpaceSettings,
};
