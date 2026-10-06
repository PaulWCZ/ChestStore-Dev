## before-next16

Machine: Intel(R) Xeon(R) Processor, 4 CPUs, 16095 MiB, Linux 6.18.44-fc-v70, cgroups v1; Node v24.21.0, npm 11.19.0. Measured 2026-10-05T22:45Z → 2026-10-06T00:29Z, one tool at a time; load average (1 min) during the rests: 0.05–3.41.

### Image and build

Sizes in MiB (disk usage, `du -sk`). *node_modules*: after `npm ci` → after `npm prune --omit=dev` (what the image keeps). *Build*: what `build.command` left (of which a build cache). *npm ci*: run in a cgroup limited to 512 MiB and one CPU (with the npm cache of this machine warm): its time and cgroup peak, or **no** when the kernel killed it (then installed again without limit). Build peak: the process tree's PSS, sampled every 250 ms, on 4 CPUs without limit. *512 MiB, 1 CPU*: the same build in a cgroup limited to 512 MiB and one CPU — whether it finished, in how long, and its cgroup peak.

| Tool | Repository | node_modules | Build output | Image | npm ci (512 MiB, 1 CPU) | Build (4 CPUs) | Build peak PSS / RSS | 512 MiB, 1 CPU |
|---|--:|--:|--:|--:|--:|--:|--:|---|
| booking | 12.7 | 504 → 443 | 5 | 461 | **no** (OOM at 512 MiB); 8.6 s free | 20.1 s | 999 / 1089 | fits, 40.7 s, peak 509 |
| crm | 10.7 | 507 → 445 | 6 | 462 | **no** (OOM at 512 MiB); 10.7 s free | 18.3 s | 1093 / 1168 | fits, 45.4 s, peak 505 |
| equipment | 11.0 | 505 → 443 | 6 | 459 | **no** (OOM at 512 MiB); 12.2 s free | 19.2 s | 1011 / 1102 | fits, 44.9 s, peak 512 |
| expenses | 8.9 | 561 → 499 | 6 | 514 | **no** (OOM at 512 MiB); 12.7 s free | 19.4 s | 1035 / 1137 | **no** (exit 137, OOM), 43.1 s, peak 512 |
| forms | 20.4 | 504 → 443 | 6 | 469 | **no** (OOM at 512 MiB); 11.0 s free | 17.4 s | 1029 / 1123 | **no** (exit 137, OOM), 42.3 s, peak 512 |
| goals | 9.8 | 504 → 443 | 5 | 457 | **no** (OOM at 512 MiB); 9.2 s free | 17.5 s | 972 / 1075 | fits, 39.6 s, peak 486 |
| helpdesk | 11.9 | 504 → 443 | 5 | 460 | **no** (OOM at 512 MiB); 9.0 s free | 17.8 s | 923 / 1017 | **no** (exit 137, OOM), 41.4 s, peak 512 |
| hiring | 12.0 | 506 → 445 | 7 | 463 | **no** (OOM at 512 MiB); 8.4 s free | 20.9 s | 999 / 1088 | fits, 44.4 s, peak 512 |
| leave | 8.0 | 504 → 443 | 5 | 455 | **no** (OOM at 512 MiB); 10.0 s free | 16.4 s | 1033 / 1135 | **no** (exit 137, OOM), 34.6 s, peak 512 |
| news | 10.7 | 518 → 458 | 6 | 475 | **no** (OOM at 512 MiB); 9.5 s free | 16.6 s | 994 / 1099 | fits, 41.4 s, peak 508 |
| people | 11.6 | 504 → 443 | 6 | 460 | **no** (OOM at 512 MiB); 9.2 s free | 19.6 s | 1064 / 1170 | fits, 40.2 s, peak 512 |
| polls | 10.9 | 504 → 443 | 4 | 458 | **no** (OOM at 512 MiB); 11.3 s free | 15.6 s | 962 / 1056 | fits, 35.4 s, peak 504 |
| quotes | 14.7 | 504 → 443 | 6 | 464 | **no** (OOM at 512 MiB); 10.1 s free | 15.8 s | 1102 / 1198 | fits, 38.6 s, peak 508 |
| rooms | 12.8 | 504 → 443 | 5 | 461 | **no** (OOM at 512 MiB); 8.9 s free | 14.1 s | 924 / 1030 | **no** (exit 137, OOM), 32.4 s, peak 512 |
| status | 13.6 | 504 → 443 | 6 | 463 | **no** (OOM at 512 MiB); 12.4 s free | 15.9 s | 969 / 1067 | fits, 37.2 s, peak 510 |
| tasks | 11.0 | 507 → 445 | 5 | 461 | **no** (OOM at 512 MiB); 9.9 s free | 16.5 s | 1005 / 1110 | **no** (exit 137, OOM), 38.3 s, peak 512 |
| timesheets | 10.3 | 504 → 443 | 5 | 458 | **no** (OOM at 512 MiB); 8.9 s free | 16.4 s | 980 / 1069 | fits, 35.4 s, peak 441 |
| wiki | 14.3 | 524 → 464 | 7 | 485 | **no** (OOM at 512 MiB); 10.7 s free | 19.6 s | 932 / 1023 | **no** (exit 137, OOM), 46.0 s, peak 512 |
| ref-forms | 0.4 | 475 → 440 | 3 | 443 | **no** (OOM at 512 MiB); 9.6 s free | 10.7 s | 740 / 836 | fits, 25.7 s, peak 472 |
| ref-perseus-starter | 0.4 | 109 → 13 | 0 | 13 | 2.9 s, peak 277 | 1.0 s | 91 / 177 | fits, 1.4 s, peak 132 |

### The server

Started as the Chest starts it (`build.start`, i.e. `npm start`, with the Chest's environment), the database migrated and seeded. *Cold start*: ms from spawn until the port accepts a connection, and until the first 200 of the main members' page (signed member) — median (min–max) of the cold starts. *At rest*: after one request to each page of the frozen list, then the idle time; RSS and PSS summed over the server's whole process tree (npm included) — median (min–max) of the rests. *Peak*: the tree's PSS during the requests (sampled every 50 ms). *Server alone*: the same without the `npm` process (PSS, and RSS as an upper bound).

| Tool | SDK | Pages (200) | Port open (ms) | First 200 (ms) | RSS at rest (MiB) | PSS at rest (MiB) | Peak PSS (MiB) | Server alone PSS / RSS | Processes |
|---|---|--:|--:|--:|--:|--:|--:|--:|--:|
| booking | 0.3.1-studio.1 | – | – | – | – | – | – | – / – | – |
| crm | 0.3.1-studio.1 | 16/16 | 379 (324–512) | 919 (751–1342) | 236.7 (234.7–238.2) | 147.0 (136.7–160.3) | 192.9 | 121.8 / 169.5 | 3 |
| equipment | 0.3.1-studio.1 | 16/16 | 390 (273–509) | 942 (671–1414) | 232.4 (231.4–232.7) | 126.2 (125.2–131.7) | 162.4 | 106.3 / 165.4 | 3 |
| expenses | 0.3.1-studio.1 | 11/12 | 324 (271–471) | 779 (641–1186) | 233.9 (232.4–234.4) | 127.0 (125.5–127.5) | 159.7 | 107.4 / 166.8 | 3 |
| forms | 0.3.1-studio.1 | 20/20 | 395 (317–553) | 949 (726–1247) | 233.8 (232.7–234.7) | 137.3 (136.0–139.0) | 170.7 | 113.7 / 166.8 | 3 |
| goals | 0.3.1-studio.1 | 12/12 | 396 (309–609) | 913 (779–1341) | 232.5 (230.9–233.6) | 126.1 (123.6–126.7) | 160.2 | 106.2 / 165.5 | 3 |
| helpdesk | 0.3.1-studio.1 | 14/14 | 364 (266–419) | 880 (685–944) | 229.4 (228.2–231.3) | 136.9 (135.7–138.8) | 167.0 | 111.9 / 162.3 | 3 |
| hiring | 0.3.1-studio.1 | 17/17 | 358 (269–427) | 857 (642–1145) | 233.2 (232.2–233.5) | 135.1 (133.6–140.4) | 169.8 | 112.6 / 166.3 | 3 |
| leave | 0.3.1-studio.1 | 10/10 | 311 (259–399) | 749 (606–851) | 229.9 (228.3–231.2) | 121.3 (119.9–123.9) | 154.0 | 102.3 / 162.8 | 3 |
| news | 0.3.1-studio.1 | 15/15 | 351 (249–387) | 820 (634–908) | 230.1 (229.0–231.8) | 119.9 (119.0–121.2) | 152.6 | 101.1 / 162.8 | 3 |
| people | 0.3.1-studio.1 | 20/20 | 270 (248–355) | 639 (613–978) | 236.4 (233.7–236.7) | 125.7 (122.9–126.0) | 159.2 | 107.5 / 169.4 | 3 |
| polls | 0.3.1-studio.1 | 10/10 | 321 (270–505) | 726 (605–985) | 229.8 (227.8–230.8) | 131.4 (129.7–134.2) | 162.4 | 108.9 / 163.0 | 3 |
| quotes | 0.3.1-studio.1 | – | – | – | – | – | – | – / – | – |
| rooms | 0.3.1-studio.1 | 7/7 | 319 (252–362) | 785 (694–826) | 229.9 (227.7–230.2) | 119.2 (117.0–119.4) | 150.5 | 101.1 / 162.9 | 3 |
| status | 0.3.1-studio.1 | – | – | – | – | – | – | – / – | – |
| tasks | 0.3.1-studio.1 | 13/13 | 325 (263–491) | 761 (634–1276) | 232.4 (230.8–234.1) | 142.2 (140.6–150.6) | 174.9 | 117.3 / 165.3 | 3 |
| timesheets | 0.3.1-studio.1 | 12/12 | 291 (267–348) | 676 (624–765) | 231.2 (230.6–233.6) | 138.8 (138.3–142.9) | 171.6 | 113.8 / 164.2 | 3 |
| wiki | 0.3.1-studio.1 | 19/19 | 310 (262–351) | 730 (642–809) | 232.2 (231.3–232.8) | 155.5 (154.7–156.2) | 189.4 | 124.9 / 165.3 | 3 |
| ref-forms | 0.4.0 | – | – | – | – | – | – | – / – | – |
| ref-perseus-starter | 0.4.1 | – | – | – | – | – | – | – / – | – |

Notes:

- booking: npm ci did not finish under 512 MiB and 1 CPU (SIGKILL, killed for memory); installed again without limits
- booking: cold start 3: no 200 on /chest (401): 
- crm: npm ci did not finish under 512 MiB and 1 CPU (SIGKILL, killed for memory); installed again without limits
- equipment: npm ci did not finish under 512 MiB and 1 CPU (SIGKILL, killed for memory); installed again without limits
- expenses: npm ci did not finish under 512 MiB and 1 CPU (SIGKILL, killed for memory); installed again without limits
- expenses: pages not 200: /chest/expenses/101 → 404
- forms: npm ci did not finish under 512 MiB and 1 CPU (SIGKILL, killed for memory); installed again without limits
- goals: npm ci did not finish under 512 MiB and 1 CPU (SIGKILL, killed for memory); installed again without limits
- helpdesk: npm ci did not finish under 512 MiB and 1 CPU (SIGKILL, killed for memory); installed again without limits
- hiring: npm ci did not finish under 512 MiB and 1 CPU (SIGKILL, killed for memory); installed again without limits
- leave: npm ci did not finish under 512 MiB and 1 CPU (SIGKILL, killed for memory); installed again without limits
- news: npm ci did not finish under 512 MiB and 1 CPU (SIGKILL, killed for memory); installed again without limits
- people: npm ci did not finish under 512 MiB and 1 CPU (SIGKILL, killed for memory); installed again without limits
- polls: npm ci did not finish under 512 MiB and 1 CPU (SIGKILL, killed for memory); installed again without limits
- quotes: npm ci did not finish under 512 MiB and 1 CPU (SIGKILL, killed for memory); installed again without limits
- rooms: npm ci did not finish under 512 MiB and 1 CPU (SIGKILL, killed for memory); installed again without limits
- status: npm ci did not finish under 512 MiB and 1 CPU (SIGKILL, killed for memory); installed again without limits
- tasks: npm ci did not finish under 512 MiB and 1 CPU (SIGKILL, killed for memory); installed again without limits
- timesheets: npm ci did not finish under 512 MiB and 1 CPU (SIGKILL, killed for memory); installed again without limits
- wiki: npm ci did not finish under 512 MiB and 1 CPU (SIGKILL, killed for memory); installed again without limits
- ref-forms: npm ci did not finish under 512 MiB and 1 CPU (SIGKILL, killed for memory); installed again without limits
- ref-perseus-starter: vendor/chest-sdk-0.4.1.tgz is not in the source: packed @argentic/chest-sdk@0.4.1 from npm into vendor/

