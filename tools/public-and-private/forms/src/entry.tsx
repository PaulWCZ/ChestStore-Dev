import "@argentic/chest-ui/components.css";
import "./tokens.css";
import "./styles.css";
import { ToastHost } from "@argentic/chest-app/client";
import { start } from "@argentic/chest-app/browser";
import lazy from "virtual:chest-islands";

// The browser's script (/assets/client.js): the kit's and Forms' styles,
// then the islands and the forms come to life. The look's tokens come in
// a stylesheet of their own (/chest/look.css, /look.css: src/lib/theme.ts).
// Each island's code is a chunk of its own, loaded by a page that shows it:
// a public form downloads the form, not the builder or the answers table.
await start({ ToastHost }, lazy);
