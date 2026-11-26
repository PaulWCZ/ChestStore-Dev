import "@argentic/chest-ui/components.css";
import "./tokens.css";
import "./styles.css";
import { start } from "@argentic/chest-app/browser";
import { islands } from "./islands/index.ts";

// The browser's script (/assets/client.js): the kit's and the tool's
// styles, then the islands and the forms come to life. The look is not
// here: it is the company's choice, served at /chest/look.css (src/theme.ts).
start(islands);
