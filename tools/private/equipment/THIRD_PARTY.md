# Third-party material

| What | Source | Licence | Where |
|---|---|---|---|
| IBM Plex Sans (font) | [IBM/plex](https://github.com/IBM/plex), via `@fontsource-variable/ibm-plex-sans` | OFL-1.1 | `public/assets/fonts/`, licence in `public/assets/fonts/LICENSE-ibm-plex-sans.txt` |
| IBM Plex Mono (font) | [IBM/plex](https://github.com/IBM/plex), via `@fontsource/ibm-plex-mono` 5.3.0 | OFL-1.1 | `public/assets/fonts/`, licence in `public/assets/fonts/LICENSE-ibm-plex-mono.txt` |
| QR code algorithm (ideas, no code copied) | [Project Nayuki QR Code generator](https://github.com/nayuki/QR-Code-generator) | MIT | `src/shared/qr.ts` follows the steps of ISO/IEC 18004 in the order that project lays them out (block interleaving, Reed–Solomon divisor, masks, penalty); written for this tool |
| jsQR (tests only) | [cozmo/jsQR](https://github.com/cozmo/jsQR), npm `jsqr` 1.4.0 | Apache-2.0 | dev dependency: `test/qr.test.ts` decodes the codes `src/shared/qr.ts` makes; never shipped |

Snipe-IT's export columns (facts for interoperability, no code or data
copied): the test files `test/fixtures/snipe-it-custom-asset-report.csv`
and `test/fixtures/snipe-it-assets-list-export.csv` are written by the
studio (made-up company and people) with the columns Snipe-IT writes,
read first-hand on 2026-09-29 from its `master` branch:
the Custom Asset Report's header, in order, in
[`app/Http/Controllers/ReportsController.php`](https://github.com/grokability/snipe-it/blob/master/app/Http/Controllers/ReportsController.php)
(`postCustom`: a UTF-8 BOM, `Purchased` and dates as `Y-m-d`, the
assigned person's `display_name` under `Checked Out` with a `Type`
column saying user / location / asset, "Notes" written twice — the
user's, then the asset's — custom fields last, by name); the titles from
[`resources/lang/en-US/general.php`](https://github.com/grokability/snipe-it/blob/master/resources/lang/en-US/general.php),
[`admin/hardware/table.php`](https://github.com/grokability/snipe-it/blob/master/resources/lang/en-US/admin/hardware/table.php),
[`admin/hardware/form.php`](https://github.com/grokability/snipe-it/blob/master/resources/lang/en-US/admin/hardware/form.php)
and [`admin/reports/general.php`](https://github.com/grokability/snipe-it/blob/master/resources/lang/en-US/admin/reports/general.php);
`Warranty Expires` as `AssetPresenter::warranty_expires()` writes it
(`Y-m-d`). The assets list's export uses the column titles of
[`app/Presenters/AssetPresenter.php`](https://github.com/grokability/snipe-it/blob/master/app/Presenters/AssetPresenter.php)
(`dataTableLayout`); its cell values (what the list displays with
default settings) are assumed, not seen: no Snipe-IT was run here.

Ideas only (no code): Snipe-IT (AGPL-3.0: data model, check-out/in,
licences with seats, its CSV sample's header), Shelf.nu (AGPL-3.0: QR labels,
custody, "report" from a scanned label), GLPI (GPL-3.0: what not to become).
See `reports/02-open-source/equipment.md` in the studio.

Microsoft Intune (read only, `src/lib/intune.ts`): the request and answer
shapes follow Microsoft's documentation (Microsoft Graph v1.0
`managedDevices`, paging, throttling; the Microsoft identity platform's
client-credentials grant), read on 2026-09-29 from its sources on GitHub
(microsoftgraph/microsoft-graph-docs-contrib, whose LICENSE is CC BY 4.0;
MicrosoftDocs/entra-docs, whose LICENSE is MIT; no text or code copied,
only the documented names of fields and endpoints). The test's fake Graph
answers in the documented shapes.

Dependencies — `hono` and `@hono/node-server` (MIT), `react` and `react-dom`
(MIT), `postgres` (Unlicense); in development `vite` (MIT), `typescript`
(Apache-2.0), `@electric-sql/pglite` (Apache-2.0); and the studio's own
packages, MIT, © 2026 Argentic, vendored in `vendor/`: `@argentic/chest-app`
(the server and browser machinery), `@argentic/chest-sdk`, `@argentic/chest-ui`
(the UI kit) — are installed from npm or `vendor/` under their own
licences. Next.js is no longer used (since October 2026).
