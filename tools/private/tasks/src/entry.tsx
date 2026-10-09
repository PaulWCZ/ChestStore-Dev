import "@argentic/chest-ui/components.css";
import "./styles.css";
import { ToastHost } from "@argentic/chest-app/client";
import { start } from "@argentic/chest-app/browser";
import lazy from "virtual:chest-islands";

// The browser's script (/assets/client.js): the kit's and the tool's
// styles, then the islands and the forms come to life. The look is not
// here: it is the company's choice, served at /chest/look.css (src/theme.ts).
// Each island's code is a chunk of its own, loaded by a page that shows it
// (a board downloads the board's code, My tasks its own).
await start({ ToastHost }, lazy);
