import "@argentic/chest-ui/components.css";
import "./tokens.css";
import "./styles.css";
import { start } from "@argentic/chest-app/browser";
import { islands } from "./islands/index.ts";

// The browser's script (/assets/client.js): the kit's and the tool's
// styles (the look itself is /chest/look.css, the company's choice), then
// the islands and the forms come to life.
start(islands);
