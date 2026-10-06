import "virtual:look.css";
import "@argentic/chest-ui/components.css";
import "./styles.css";
import { ToastHost } from "@argentic/chest-app/client";
import { start } from "@argentic/chest-app/browser";
import lazy from "virtual:chest-islands";

// The browser's script (/assets/client-<hash>.js): the look, the kit's and
// the tool's styles, then the islands and the forms come to life. The
// layout's ToastHost is in every page; each other island is a chunk of its
// own, loaded only by a page that shows it (src/islands/*.tsx, listed by
// chestConfig as virtual:chest-islands).
await start({ ToastHost }, lazy);
