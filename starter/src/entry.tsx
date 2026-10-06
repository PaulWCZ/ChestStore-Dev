import "virtual:look.css";
import "@argentic/chest-ui/components.css";
import "./styles.css";
import { start } from "@argentic/chest-app/browser";
import { islands } from "./islands/index.ts";

// The browser's script (/assets/client.js): the look, the kit's and the
// tool's styles, then the islands and the forms come to life.
start(islands);
