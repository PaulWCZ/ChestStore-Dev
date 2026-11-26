/// <reference types="vite/client" />
declare module "virtual:look.css";
// The tool's islands, each loaded when a page shows it (chestConfig).
declare module "virtual:chest-islands" {
  const lazy: Record<string, () => Promise<unknown>>;
  export default lazy;
}
