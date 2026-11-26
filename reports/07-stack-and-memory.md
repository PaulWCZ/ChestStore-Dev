# Stack and memory — the 18 tools before and after leaving Next.js

_Measured on 6–7 October 2026 by `lab/measure` (its README says how), on
this studio machine: Intel Xeon, 4 CPUs, 16 GiB, Linux 6.18, cgroups v1,
Node 24.21 (the Chest's pinned image), PostgreSQL 16. Not a Chest
container: the numbers compare the two stacks under the same conditions;
they are not a Chest's own figures._

## The answer

All 18 tools left Next.js 16 for the studio's stack: Hono, React rendered
on the server with islands, Vite, built on the Perseus starter's design
and packaged as `@argentic/chest-app` (`app/`, `reports/06-perseus-starter.md`).
**No tool stays on another stack**: none had a measured reason to.

Per tool, median of the medians:

- **Memory at rest** (PSS of the whole process tree, `npm start` included,
  as the Chest runs it): 134–173 MiB → 93–105 MiB, **−24 to −45 %**.
  The server alone: 111–143 MiB → 62–75 MiB PSS (about −45 %).
- **Peak during the page round**: 171–241 MiB → 96–112 MiB, **−40 to −58 %**.
- **Cold start to the first 200** of the members' main page: 635–833 ms →
  319–487 ms, **−33 to −58 %**.
- **Image** (what the Chest keeps: production `node_modules` + build):
  455–514 MiB → 27–40 MiB, **−91 to −94 %**.
- **Build**: `npm ci` of every Next.js tool was killed in 512 MiB and one
  CPU (the limit `brief/08` names); every tool now installs in ~280 MiB
  (Expenses 431 MiB: its receipt reader) and builds in 2–3 s, peak
  267–400 MiB PSS, all within 512 MiB. The contract's build budget is
  1.5 GiB and 2 CPUs (`reference/contract/application-contract.md`,
  "Build"), which Next.js also fitted (peak ~1.0–1.1 GiB).

## How it was measured

- **Before**: label `before-next16-final`, the tools at `a7c54ca` (Next.js
  16, SDK 0.3.1-studio.1), measured 6 October 09:09–20:10 UTC.
- **After**: label `after-mail`, the tools at the integration branch of
  7 October (SDK 0.4.1-studio.7, package studio.8, the owner's mail
  decisions applied), measured 7 October 00:20–02:02 UTC, then the seven
  tools that read groups again at ~02:30 after a bench fix (the bench
  signed members with no groups; a Chest carries them with
  `members.groups`).
- Since then the package moved to studio.9 (documentation, `field.email`,
  a source check run by tests): nothing that runs at rest changed, so the
  numbers were not taken again.
- One tool at a time, nothing else running; load average during the rests
  0.02–2.26 before, 0.00–0.33 after. Each tool: built as the Chest builds
  it, started with `build.start` and the Chest's environment against a
  fake Chest (`@argentic/chest-sdk/testing`), database migrated and
  seeded; 10 cold starts; 5 rests of 30 s after one request to each page
  of a frozen page list (`lab/measure/pages/`); PSS and RSS summed over
  the process tree from `/proc`.
- Full tables: `lab/measure/results/after-mail/TABLE.md`; raw results in
  `lab/measure/results/<label>/<tool>.json`.

## Per tool

| Tool | PSS at rest, tree (MiB) | Server alone PSS / RSS (MiB) | Peak PSS (MiB) | First 200 (ms) | Image (MiB) | Build fits 512 MiB, 1 CPU |
|---|--:|--:|--:|--:|--:|---|
| booking | 149.9 → 105.2 (−30 %) | 125.3 / 175.5 → 75.0 / 114.2 | 186.3 → 111.4 (−40 %) | 653 → 326 (−50 %) | 461 → 32 (−93 %) | no → yes |
| crm | 148.8 → 96.6 (−35 %) | 124.0 / 169.4 → 66.4 / 105.9 | 191.9 → 104.2 (−46 %) | 728 → 487 (−33 %) | 462 → 33 (−93 %) | no → yes |
| equipment | 153.8 → 95.0 (−38 %) | 123.1 / 164.4 → 64.9 / 104.3 | 176.9 → 101.9 (−42 %) | 744 → 383 (−49 %) | 459 → 30 (−93 %) | yes → yes |
| expenses | 144.2 → 95.1 (−34 %) | 119.3 / 167.4 → 64.8 / 104.1 | 177.5 → 98.4 (−45 %) | 709 → 365 (−48 %) | 514 → 34 (−93 %) | no → yes |
| forms | 149.0 → 96.4 (−35 %) | 122.6 / 167.9 → 65.5 / 104.0 | 178.7 → 99.9 (−44 %) | 722 → 344 (−52 %) | 469 → 40 (−91 %) | yes → yes |
| goals | 149.4 → 101.1 (−32 %) | 121.6 / 164.5 → 67.9 / 104.4 | 183.8 → 105.0 (−43 %) | 635 → 348 (−45 %) | 457 → 29 (−94 %) | yes → yes |
| helpdesk | 143.0 → 94.7 (−34 %) | 117.6 / 163.3 → 64.5 / 103.6 | 171.2 → 97.7 (−43 %) | 783 → 344 (−56 %) | 460 → 31 (−93 %) | yes → yes |
| hiring | 143.1 → 97.2 (−32 %) | 118.0 / 165.3 → 67.1 / 106.3 | 177.8 → 101.2 (−43 %) | 764 → 330 (−57 %) | 463 → 34 (−93 %) | yes → yes |
| leave | 134.4 → 101.5 (−24 %) | 110.6 / 161.7 → 68.4 / 104.7 | 183.2 → 107.0 (−42 %) | 676 → 319 (−53 %) | 455 → 27 (−94 %) | yes → yes |
| news | 142.9 → 99.7 (−30 %) | 117.8 / 164.7 → 66.5 / 102.8 | 175.9 → 103.1 (−41 %) | 691 → 329 (−52 %) | 475 → 28 (−94 %) | no → yes |
| people | 144.4 → 95.3 (−34 %) | 119.5 / 169.1 → 65.3 / 104.5 | 180.0 → 99.5 (−45 %) | 719 → 336 (−53 %) | 460 → 31 (−93 %) | yes → yes |
| polls | 152.1 → 99.2 (−35 %) | 121.5 / 162.4 → 66.1 / 102.4 | 182.7 → 104.0 (−43 %) | 649 → 341 (−47 %) | 458 → 30 (−94 %) | yes → yes |
| quotes | 138.4 → 97.0 (−30 %) | 114.7 / 167.8 → 66.8 / 106.0 | 173.6 → 100.8 (−42 %) | 771 → 325 (−58 %) | 464 → 34 (−93 %) | no → yes |
| rooms | 152.4 → 99.8 (−35 %) | 121.8 / 162.8 → 66.6 / 102.9 | 172.2 → 103.7 (−40 %) | 807 → 375 (−54 %) | 461 → 32 (−93 %) | yes → yes |
| status | 173.3 → 95.9 (−45 %) | 142.6 / 182.8 → 65.1 / 103.5 | 241.2 → 101.9 (−58 %) | 833 → 442 (−47 %) | 463 → 32 (−93 %) | yes → yes |
| tasks | 154.0 → 102.9 (−33 %) | 123.5 / 163.6 → 69.6 / 105.9 | 186.6 → 107.7 (−42 %) | 640 → 353 (−45 %) | 461 → 33 (−93 %) | yes → yes |
| timesheets | 153.6 → 93.7 (−39 %) | 123.1 / 163.3 → 63.6 / 102.6 | 186.1 → 98.6 (−47 %) | 663 → 347 (−48 %) | 458 → 30 (−94 %) | yes → yes |
| wiki | 154.6 → 101.8 (−34 %) | 123.9 / 164.1 → 68.9 / 105.4 | 188.5 → 108.5 (−42 %) | 733 → 343 (−53 %) | 485 → 39 (−92 %) | no → yes |

Pages answering 200 after the move: all, except Hiring's `/chest/mail`
(removed by the owner's decision: no inbound mail) and Expenses'
`/chest/expenses/101`, 404 on both sides (the frozen list names an
expense the seed no longer has).

## The references, same bench

| | PSS at rest, tree | Server alone PSS / RSS | First 200 | Image |
|---|--:|--:|--:|--:|
| Reference Perseus starter (SDK 0.4.1) | 66.4 MiB | 34.3 / 68.9 MiB | 208 ms | 13 MiB |
| Studio starter (package studio.8) | 76.9 MiB | 42.0 / 73.9 MiB | 266 ms | 18 MiB |
| Reference Forms (Next.js, SDK 0.4.0) | 113.7 MiB | 83.6 / 122.6 MiB | 540 ms | 443 MiB |

A tool costs 15–30 MiB more than the empty studio starter: its own code,
words, migrations and caches.

## What the Chest could still save

- **`npm start` stays resident** beside every awake tool: about 30 MiB
  PSS of each tool's 93–105 MiB (the tree minus the server alone). Letting
  `build.start` name a Node entry would save it for every tool
  (`reports/03-sdk-report.md` §4.17).
- **Compression at the front**: the package compresses itself, which
  Next.js also did; one place for every tool would be cheaper (§4.17).

## What was not measured

- A real Chest container, its launcher and its cgroup accounting.
- Memory under sustained load (the reviews measured some cases: Support's
  public downloads, Hiring's applications — SDK report §4.17).
- Wake from sleep on a Chest (the harness `lab/chest-dev --sleep-after`
  checks that tools survive it, not its timing).
