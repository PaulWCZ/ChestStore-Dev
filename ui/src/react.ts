// The look as a React element, for a server component (Next.js App Router):
//
//   import { ThemeStyle } from "@argentic/chest-ui/react";
//   <head><ThemeStyle look={look} nonce={nonce} /></head>
//
// Server-side only in spirit (it renders a <style> with the page's nonce);
// it has no state and no effect, and ships no script.
import { createElement, type ReactElement } from "react";
import type { Theme } from "./contract.js";
import { themeCss } from "./css.js";
import type { Look } from "./runtime.js";

const noncePattern = /^[A-Za-z0-9+/_=-]{8,128}$/u;

export function ThemeStyle({ look, nonce }: { look: Look | Theme; nonce?: string | null }): ReactElement {
  if (nonce != null && !noncePattern.test(nonce)) throw new RangeError("a nonce is 8 to 128 base64 characters");
  const css = "theme" in look ? themeCss(look.theme, { fontBase: look.fontBase }) : themeCss(look);
  return createElement("style", { ...(nonce ? { nonce } : {}), "data-chest-theme": "theme" in look ? look.theme.id : look.id, dangerouslySetInnerHTML: { __html: css } });
}
