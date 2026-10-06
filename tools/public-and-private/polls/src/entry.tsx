import "@argentic/chest-ui/components.css";
import "./tokens.css";
import "./styles.css";
import { start } from "@argentic/chest-app/browser";
import { islands } from "./islands/index.ts";

// The browser's script (/assets/client.js): the kit's and Polls' styles,
// then the islands and the forms come to life. The look's tokens come in
// a stylesheet of their own (/chest/look.css, /look.css: src/theme.ts).
start(islands);
