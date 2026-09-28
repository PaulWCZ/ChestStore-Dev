# Third-party material

| What | Source | Licence | Where |
|---|---|---|---|
| Albert Sans (font) | [usted/Albert-Sans](https://github.com/usted/Albert-Sans), via `@fontsource-variable/albert-sans` 5.3.0 | OFL-1.1 | `public/fonts/`, licence in `public/fonts/LICENSE-albert-sans.txt` |
| DM Mono (font) | [googlefonts/dm-mono](https://github.com/googlefonts/dm-mono), via `@fontsource/dm-mono` 5.3.0 | OFL-1.1 | `public/fonts/`, licence in `public/fonts/LICENSE-dm-mono.txt` |
| Hybrid-office ideas | [sebo-b/warp](https://github.com/sebo-b/warp) (assigned seats, zones), [seatsurfing/seatsurfing](https://github.com/seatsurfing/seatsurfing) (booking rules, "enforce limits in one transaction"), [MRBS](https://github.com/meeting-room-booking-system/mrbs-code) (the rooms × time grid) | MIT; GPL-3.0; GPL-2.0 | Ideas only — **no code copied** (see `reports/02-open-source/rooms.md` in the studio) |

Dependencies installed from npm under their own licences: `next`, `react`,
`react-dom` (MIT), `postgres` (Unlicense), `@argentic/chest-sdk` (MIT, the
studio's working copy in `vendor/`). Icons are drawn for this tool
(`components/icons.tsx`). `lib/csv.ts` and the shell come from the studio's
own Tasks tool (same licence and owner).
