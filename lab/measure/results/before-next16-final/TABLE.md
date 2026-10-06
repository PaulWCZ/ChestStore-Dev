## before-next16-final

Machine: Intel(R) Xeon(R) Processor, 4 CPUs, 16095 MiB, Linux 6.18.44-fc-v70, cgroups v1; Node v24.21.0, npm 11.19.0. Measured 2026-10-06T09:09Z → 2026-10-06T20:10Z, one tool at a time; load average (1 min) during the rests: 0.02–2.26.

### Image and build

Sizes in MiB (disk usage, `du -sk`). *node_modules*: after `npm ci` → after `npm prune --omit=dev` (what the image keeps). *Build*: what `build.command` left (of which a build cache). *npm ci*: run in a cgroup limited to 512 MiB and one CPU (with the npm cache of this machine warm): its time and cgroup peak, or **no** when the kernel killed it (then installed again without limit). Build peak: the process tree's PSS, sampled every 250 ms, on 4 CPUs without limit. *512 MiB, 1 CPU*: the same build in a cgroup limited to 512 MiB and one CPU — whether it finished, in how long, and its cgroup peak.

| Tool | Repository | node_modules | Build output | Image | npm ci (512 MiB, 1 CPU) | Build (4 CPUs) | Build peak PSS / RSS | 512 MiB, 1 CPU |
|---|--:|--:|--:|--:|--:|--:|--:|---|
| booking | 12.7 | 504 → 443 | 5 | 461 | **no** (OOM at 512 MiB); 8.4 s free | 15.6 s | 1055 / 1131 | **no** (exit 137, OOM), 32.1 s, peak 512 |
| crm | 10.7 | 507 → 445 | 6 | 462 | **no** (OOM at 512 MiB); 6.9 s free | 15.9 s | 1037 / 1121 | **no** (exit 137, OOM), 36.0 s, peak 512 |
| equipment | 11.0 | 505 → 443 | 6 | 459 | **no** (OOM at 512 MiB); 10.4 s free | 17.9 s | 1076 / 1165 | fits, 39.8 s, peak 512 |
| expenses | 8.9 | 561 → 499 | 6 | 514 | **no** (OOM at 512 MiB); 9.9 s free | 14.0 s | 1066 / 1142 | **no** (exit 137, OOM), 35.1 s, peak 512 |
| forms | 20.4 | 504 → 443 | 6 | 469 | **no** (OOM at 512 MiB); 8.8 s free | 17.6 s | 1076 / 1168 | fits, 39.0 s, peak 512 |
| goals | 9.8 | 504 → 443 | 5 | 457 | **no** (OOM at 512 MiB); 7.5 s free | 13.3 s | 1039 / 1121 | fits, 38.4 s, peak 508 |
| helpdesk | 11.9 | 504 → 443 | 5 | 460 | **no** (OOM at 512 MiB); 12.3 s free | 17.4 s | 985 / 1074 | fits, 34.7 s, peak 509 |
| hiring | 12.0 | 506 → 445 | 7 | 463 | **no** (OOM at 512 MiB); 9.4 s free | 19.3 s | 1079 / 1166 | fits, 40.8 s, peak 512 |
| leave | 8.0 | 504 → 443 | 5 | 455 | **no** (OOM at 512 MiB); 7.3 s free | 13.9 s | 985 / 1060 | fits, 34.3 s, peak 494 |
| news | 10.7 | 518 → 458 | 6 | 475 | **no** (OOM at 512 MiB); 9.3 s free | 15.6 s | 1057 / 1149 | **no** (exit 137, OOM), 34.3 s, peak 512 |
| people | 11.6 | 504 → 443 | 6 | 460 | **no** (OOM at 512 MiB); 9.6 s free | 15.8 s | 1056 / 1142 | fits, 36.2 s, peak 498 |
| polls | 10.9 | 504 → 443 | 4 | 458 | **no** (OOM at 512 MiB); 8.0 s free | 14.4 s | 983 / 1059 | fits, 30.6 s, peak 488 |
| quotes | 14.7 | 504 → 443 | 6 | 464 | **no** (OOM at 512 MiB); 9.6 s free | 17.5 s | 1001 / 1077 | **no** (exit 137, OOM), 39.7 s, peak 512 |
| rooms | 12.8 | 504 → 443 | 5 | 461 | **no** (OOM at 512 MiB); 9.2 s free | 15.9 s | 1020 / 1108 | fits, 36.9 s, peak 510 |
| status | 13.6 | 504 → 443 | 6 | 463 | **no** (OOM at 512 MiB); 10.7 s free | 17.1 s | 1044 / 1136 | fits, 38.9 s, peak 496 |
| tasks | 11.0 | 507 → 445 | 5 | 461 | **no** (OOM at 512 MiB); 8.7 s free | 16.5 s | 1073 / 1154 | fits, 33.9 s, peak 502 |
| timesheets | 10.3 | 504 → 443 | 5 | 458 | **no** (OOM at 512 MiB); 8.7 s free | 14.3 s | 996 / 1071 | fits, 33.3 s, peak 495 |
| wiki | 14.3 | 524 → 464 | 7 | 485 | **no** (OOM at 512 MiB); 8.8 s free | 18.2 s | 994 / 1069 | **no** (exit 137, OOM), 47.2 s, peak 512 |
| ref-forms | 0.4 | 475 → 440 | 3 | 443 | **no** (OOM at 512 MiB); 7.9 s free | 12.3 s | 827 / 901 | fits, 24.3 s, peak 480 |
| ref-perseus-starter | 0.4 | 109 → 13 | 0 | 13 | 6.0 s, peak 309 | 0.8 s | 176 / 247 | fits, 2.2 s, peak 135 |

### The server

Started as the Chest starts it (`build.start`, i.e. `npm start`, with the Chest's environment), the database migrated and seeded. *Cold start*: ms from spawn until the port accepts a connection, and until the first 200 of the main members' page (signed member) — median (min–max) of the cold starts. *At rest*: after one request to each page of the frozen list, then the idle time; RSS and PSS summed over the server's whole process tree (npm included) — median (min–max) of the rests. *Peak*: the tree's PSS during the requests (sampled every 50 ms). *Server alone*: the same without the `npm` process (PSS, and RSS as an upper bound).

| Tool | SDK | Pages (200) | Port open (ms) | First 200 (ms) | RSS at rest (MiB) | PSS at rest (MiB) | Peak PSS (MiB) | Server alone PSS / RSS | Processes |
|---|---|--:|--:|--:|--:|--:|--:|--:|--:|
| booking | 0.3.1-studio.1 | 12/12 | 276 (253–369) | 653 (623–823) | 242.9 (241.5–244.1) | 149.9 (147.9–165.0) | 186.3 | 125.3 / 175.5 | 3 |
| crm | 0.3.1-studio.1 | 16/16 | 297 (271–349) | 728 (673–845) | 236.6 (234.3–238.1) | 148.8 (142.3–157.8) | 191.9 | 124.0 / 169.4 | 3 |
| equipment | 0.3.1-studio.1 | 16/16 | 300 (259–504) | 744 (623–1033) | 231.3 (230.2–231.7) | 153.8 (142.3–154.9) | 176.9 | 123.1 / 164.4 | 3 |
| expenses | 0.3.1-studio.1 | 11/12 | 310 (284–326) | 709 (657–742) | 234.3 (232.5–235.0) | 144.2 (141.7–158.5) | 177.5 | 119.3 / 167.4 | 3 |
| forms | 0.3.1-studio.1 | 20/20 | 299 (273–377) | 722 (695–946) | 234.5 (233.1–236.7) | 149.0 (141.0–151.0) | 178.7 | 122.6 / 167.9 | 3 |
| goals | 0.3.1-studio.1 | 12/12 | 265 (257–275) | 635 (620–668) | 231.3 (231.1–232.5) | 149.4 (148.8–155.9) | 183.8 | 121.6 / 164.5 | 3 |
| helpdesk | 0.3.1-studio.1 | 14/14 | 325 (280–467) | 783 (678–1117) | 230.1 (228.2–231.4) | 143.0 (137.5–154.2) | 171.2 | 117.6 / 163.3 | 3 |
| hiring | 0.3.1-studio.1 | 17/17 | 319 (260–403) | 764 (641–944) | 232.3 (231.8–234.4) | 143.1 (142.4–156.4) | 177.8 | 118.0 / 165.3 | 3 |
| leave | 0.3.1-studio.1 | 10/10 | 300 (253–390) | 676 (618–972) | 228.4 (227.4–232.6) | 134.4 (132.2–138.4) | 183.2 | 110.6 / 161.7 | 3 |
| news | 0.3.1-studio.1 | 15/15 | 290 (254–369) | 691 (640–834) | 231.8 (229.6–232.0) | 142.9 (132.4–155.6) | 175.9 | 117.8 / 164.7 | 3 |
| people | 0.3.1-studio.1 | 20/20 | 295 (258–348) | 719 (626–855) | 236.0 (234.8–237.0) | 144.4 (142.2–154.5) | 180.0 | 119.5 / 169.1 | 3 |
| polls | 0.3.1-studio.1 | 10/10 | 279 (269–310) | 649 (604–806) | 229.5 (228.7–230.2) | 152.1 (132.6–153.5) | 182.7 | 121.5 / 162.4 | 3 |
| quotes | 0.3.1-studio.1 | 13/13 | 313 (271–455) | 771 (633–1017) | 234.6 (232.2–237.3) | 138.4 (134.7–141.4) | 173.6 | 114.7 / 167.8 | 3 |
| rooms | 0.3.1-studio.1 | 7/7 | 320 (256–447) | 807 (660–1040) | 229.7 (228.8–230.5) | 152.4 (132.5–153.6) | 172.2 | 121.8 / 162.8 | 3 |
| status | 0.3.1-studio.1 | 15/15 | 291 (250–494) | 833 (755–1289) | 249.9 (249.4–251.7) | 173.3 (172.8–175.2) | 241.2 | 142.6 / 182.8 | 3 |
| tasks | 0.3.1-studio.1 | 13/13 | 278 (252–411) | 640 (606–918) | 230.5 (229.6–233.7) | 154.0 (153.1–157.1) | 186.6 | 123.5 / 163.6 | 3 |
| timesheets | 0.3.1-studio.1 | 12/12 | 293 (273–337) | 663 (625–748) | 230.1 (229.3–231.9) | 153.6 (152.8–155.4) | 186.1 | 123.1 / 163.3 | 3 |
| wiki | 0.3.1-studio.1 | 19/19 | 303 (280–330) | 733 (709–838) | 231.1 (229.7–233.3) | 154.6 (153.2–156.8) | 188.5 | 123.9 / 164.1 | 3 |
| ref-forms | 0.4.0 | 3/3 | 313 (257–455) | 572 (504–799) | 188.0 (187.7–188.7) | 114.1 (113.9–114.8) | 127.4 | 83.7 / 122.4 | 3 |
| ref-perseus-starter | 0.4.1 | 1/1 | 181 (172–363) | 196 (186–384) | 134.3 (134.0–134.7) | 67.1 (66.8–67.6) | 67.1 | 34.6 / 68.6 | 3 |

Notes:

- booking: npm ci did not finish under 512 MiB and 1 CPU (SIGKILL, killed for memory); installed again without limits
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

