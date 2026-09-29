import { open } from "./lib.mjs";
const { browser, page, origin } = await open(11800, "camille", { viewport: { width: 390, height: 844 }, locale: "fr" });
await page.request.post(origin + "/_dev/look", { form: { level: "tool", choice: "brand:sample" } }).catch(()=>{});
for (const [n, p] of [["inv", "/chest/invoices"], ["desk", "/chest"], ["cli", "/chest/clients/1"]]) {
  await page.goto(origin + p);
  await page.screenshot({ path: "/tmp/claude-0/-home-user-ChestStore-Dev/1267dfd1-573d-5bb2-a4ac-b9ffb9e1c839/scratchpad/mig-quotes/dbg-" + n + ".png", fullPage: true });
  console.log(n, await page.evaluate(() => document.documentElement.scrollWidth - innerWidth));
}
await browser.close();
