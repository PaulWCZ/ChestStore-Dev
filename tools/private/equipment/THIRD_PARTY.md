# Third-party material

| What | Source | Licence | Where |
|---|---|---|---|
| IBM Plex Sans (font) | [IBM/plex](https://github.com/IBM/plex), via `@fontsource-variable/ibm-plex-sans` | OFL-1.1 | `public/fonts/`, licence in `public/fonts/LICENSE-ibm-plex-sans.txt` |
| IBM Plex Mono (font) | [IBM/plex](https://github.com/IBM/plex), via `@fontsource/ibm-plex-mono` 5.3.0 | OFL-1.1 | `public/fonts/`, licence in `public/fonts/LICENSE-ibm-plex-mono.txt` |
| QR code algorithm (ideas, no code copied) | [Project Nayuki QR Code generator](https://github.com/nayuki/QR-Code-generator) | MIT | `lib/qr.ts` follows the steps of ISO/IEC 18004 in the order that project lays them out (block interleaving, Reed–Solomon divisor, masks, penalty); written for this tool |
| jsQR (tests only) | [cozmo/jsQR](https://github.com/cozmo/jsQR), npm `jsqr` 1.4.0 | Apache-2.0 | dev dependency: `test/qr.test.ts` decodes the codes `lib/qr.ts` makes; never shipped |

Ideas only (no code): Snipe-IT (AGPL-3.0: data model, check-out/in,
licences with seats, its CSV sample's header), Shelf.nu (AGPL-3.0: QR labels,
custody, "report" from a scanned label), GLPI (GPL-3.0: what not to become).
See `reports/02-open-source/equipment.md` in the studio.

Dependencies (`next`, `react`, `postgres`, `@argentic/chest-sdk`) are
installed from npm under their own licences.
