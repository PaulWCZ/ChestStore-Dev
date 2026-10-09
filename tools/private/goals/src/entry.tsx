import "@argentic/chest-ui/components.css";
import "./tokens.css";
import "./styles.css";
import { start } from "@argentic/chest-app/browser";
import { islands } from "./islands/index.ts";

// The browser's script (/assets/client.js): the kit's styles, then Goals'
// own tokens and styles (they restyle the kit where the Trail map asks),
// then the islands and the forms come to life. The look itself is not
// here: it is the company's choice, served at /chest/look.css (src/theme.ts).
start(islands);
