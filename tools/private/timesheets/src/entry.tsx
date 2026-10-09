// The browser's script (/assets/client-<hash>.js): the kit's styles, the
// tool's own tokens and styles, then the islands and the forms come to
// life. The look is not built in: it is the company's choice, read at each
// request and served as a stylesheet of its own (src/theme.ts,
// /chest/look.css).
import "@argentic/chest-ui/components.css";
import "./tokens.css";
import "./styles.css";
import { start } from "@argentic/chest-app/browser";
import { islands } from "./islands/index.ts";

start(islands);
