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

## after-mail

Machine: Intel(R) Xeon(R) Processor, 4 CPUs, 16095 MiB, Linux 6.18.44-fc-v70, cgroups v1; Node v24.21.0, npm 11.19.0. Measured 2026-10-07T00:20Z → 2026-10-07T02:46Z, one tool at a time; load average (1 min) during the rests: 0.00–0.45.

### Image and build

Sizes in MiB (disk usage, `du -sk`). *node_modules*: after `npm ci` → after `npm prune --omit=dev` (what the image keeps). *Build*: what `build.command` left (of which a build cache). *npm ci*: run in a cgroup limited to 512 MiB and one CPU (with the npm cache of this machine warm): its time and cgroup peak, or **no** when the kernel killed it (then installed again without limit). Build peak: the process tree's PSS, sampled every 250 ms, on 4 CPUs without limit. *512 MiB, 1 CPU*: the same build in a cgroup limited to 512 MiB and one CPU — whether it finished, in how long, and its cgroup peak.

| Tool | Repository | node_modules | Build output | Image | npm ci (512 MiB, 1 CPU) | Build (4 CPUs) | Build peak PSS / RSS | 512 MiB, 1 CPU |
|---|--:|--:|--:|--:|--:|--:|--:|---|
| booking | 12.9 | 111 → 17 | 2 | 32 | 2.5 s, peak 287 | 2.1 s | 295 / 367 | fits, 4.2 s, peak 239 |
| crm | 10.8 | 114 → 19 | 3 | 33 | 3.5 s, peak 286 | 3.0 s | 350 / 390 | fits, 5.5 s, peak 304 |
| equipment | 11.1 | 112 → 17 | 2 | 30 | 3.2 s, peak 288 | 2.5 s | 324 / 396 | fits, 4.4 s, peak 269 |
| expenses | 10.2 | 168 → 17 | 7 | 34 | 5.0 s, peak 431 | 2.2 s | 304 / 376 | fits, 5.5 s, peak 250 |
| forms | 21.0 | 111 → 17 | 3 | 40 | 2.8 s, peak 285 | 2.5 s | 345 / 384 | fits, 4.9 s, peak 307 |
| goals | 9.9 | 111 → 17 | 2 | 29 | 2.3 s, peak 287 | 2.1 s | 273 / 335 | fits, 3.9 s, peak 273 |
| helpdesk | 12.6 | 111 → 17 | 2 | 31 | 2.5 s, peak 288 | 2.0 s | 267 / 326 | fits, 4.1 s, peak 259 |
| hiring | 12.4 | 114 → 19 | 3 | 34 | 3.4 s, peak 281 | 2.4 s | 332 / 404 | fits, 5.2 s, peak 294 |
| leave | 8.6 | 111 → 17 | 2 | 27 | 3.2 s, peak 285 | 2.3 s | 305 / 371 | fits, 4.2 s, peak 259 |
| news | 9.1 | 125 → 17 | 3 | 28 | 3.6 s, peak 313 | 2.4 s | 400 / 466 | fits, 4.6 s, peak 279 |
| people | 12.0 | 111 → 17 | 2 | 31 | 2.4 s, peak 279 | 2.2 s | 286 / 358 | fits, 4.9 s, peak 290 |
| polls | 11.0 | 111 → 17 | 2 | 30 | 2.5 s, peak 286 | 1.9 s | 267 / 333 | fits, 3.8 s, peak 238 |
| quotes | 14.8 | 111 → 17 | 3 | 34 | 3.3 s, peak 288 | 2.4 s | 368 / 399 | fits, 5.0 s, peak 321 |
| rooms | 12.9 | 111 → 17 | 2 | 32 | 2.9 s, peak 278 | 2.0 s | 298 / 352 | fits, 4.2 s, peak 257 |
| status | 13.6 | 111 → 17 | 2 | 32 | 2.3 s, peak 287 | 2.1 s | 291 / 362 | fits, 3.7 s, peak 252 |
| studio-starter | 0.8 | 110 → 16 | 1 | 18 | 3.3 s, peak 284 | 1.3 s | 258 / 324 | fits, 2.4 s, peak 191 |
| tasks | 11.1 | 114 → 19 | 3 | 33 | 3.2 s, peak 281 | 2.5 s | 350 / 416 | fits, 4.7 s, peak 269 |
| timesheets | 11.0 | 111 → 17 | 2 | 30 | 3.0 s, peak 287 | 2.2 s | 267 / 325 | fits, 4.9 s, peak 262 |
| wiki | 14.4 | 131 → 21 | 3 | 39 | 4.4 s, peak 325 | 2.8 s | 392 / 459 | fits, 5.6 s, peak 298 |
| ref-forms | 0.4 | 475 → 440 | 3 | 443 | **no** (OOM at 512 MiB); 7.3 s free | 11.3 s | 799 / 873 | fits, 24.2 s, peak 508 |
| ref-perseus-starter | 0.4 | 109 → 13 | 0 | 13 | 2.1 s, peak 292 | 0.7 s | 186 / 258 | fits, 1.3 s, peak 134 |

### The server

Started as the Chest starts it (`build.start`, i.e. `npm start`, with the Chest's environment), the database migrated and seeded. *Cold start*: ms from spawn until the port accepts a connection, and until the first 200 of the main members' page (signed member) — median (min–max) of the cold starts. *At rest*: after one request to each page of the frozen list, then the idle time; RSS and PSS summed over the server's whole process tree (npm included) — median (min–max) of the rests. *Peak*: the tree's PSS during the requests (sampled every 50 ms). *Server alone*: the same without the `npm` process (PSS, and RSS as an upper bound).

| Tool | SDK | Pages (200) | Port open (ms) | First 200 (ms) | RSS at rest (MiB) | PSS at rest (MiB) | Peak PSS (MiB) | Server alone PSS / RSS | Processes |
|---|---|--:|--:|--:|--:|--:|--:|--:|--:|
| booking | 0.4.1-studio.7 | 12/12 | 245 (222–321) | 326 (316–430) | 179.8 (178.4–180.3) | 105.2 (103.7–105.7) | 111.4 | 75.0 / 114.2 | 3 |
| crm | 0.4.1-studio.7 | 16/16 | 324 (269–514) | 487 (372–632) | 171.5 (171.0–173.1) | 96.6 (96.0–98.2) | 104.2 | 66.4 / 105.9 | 3 |
| equipment | 0.4.1-studio.7 | 16/16 | 276 (260–342) | 383 (354–454) | 169.8 (169.2–170.4) | 95.0 (94.3–95.6) | 101.9 | 64.9 / 104.3 | 3 |
| expenses | 0.4.1-studio.7 | 11/12 | 277 (249–364) | 365 (340–457) | 170.0 (169.5–170.8) | 95.1 (94.7–96.0) | 98.4 | 64.8 / 104.1 | 3 |
| forms | 0.4.1-studio.7 | 20/20 | 265 (242–290) | 344 (312–383) | 169.6 (168.3–170.8) | 96.4 (95.1–97.6) | 99.9 | 65.5 / 104.0 | 3 |
| goals | 0.4.1-studio.7 | 12/12 | 248 (231–281) | 348 (333–408) | 170.1 (169.5–170.6) | 101.1 (100.5–101.5) | 105.0 | 67.9 / 104.4 | 3 |
| helpdesk | 0.4.1-studio.7 | 14/14 | 254 (233–275) | 344 (322–383) | 169.3 (167.8–169.5) | 94.7 (93.1–94.9) | 97.7 | 64.5 / 103.6 | 3 |
| hiring | 0.4.1-studio.7 | 16/17 | 254 (236–437) | 330 (311–533) | 171.9 (171.2–172.6) | 97.2 (96.4–97.9) | 101.2 | 67.1 / 106.3 | 3 |
| leave | 0.4.1-studio.7 | 10/10 | 244 (232–265) | 319 (307–353) | 170.3 (169.2–170.8) | 101.5 (100.5–102.1) | 107.0 | 68.4 / 104.7 | 3 |
| news | 0.4.1-studio.7 | 15/15 | 236 (223–250) | 329 (310–340) | 168.6 (168.3–168.8) | 99.7 (99.5–99.8) | 103.1 | 66.5 / 102.8 | 3 |
| people | 0.4.1-studio.7 | 20/20 | 259 (236–289) | 336 (309–398) | 169.9 (169.2–170.6) | 95.3 (94.5–96.0) | 99.5 | 65.3 / 104.5 | 3 |
| polls | 0.4.1-studio.7 | 10/10 | 262 (250–282) | 341 (328–364) | 168.1 (166.9–168.3) | 99.2 (98.2–99.5) | 104.0 | 66.1 / 102.4 | 3 |
| quotes | 0.4.1-studio.7 | 13/13 | 246 (233–266) | 325 (316–514) | 171.7 (168.1–175.9) | 97.0 (93.4–101.2) | 100.8 | 66.8 / 106.0 | 3 |
| rooms | 0.4.1-studio.7 | 7/7 | 250 (229–304) | 375 (346–437) | 168.5 (167.1–170.1) | 99.8 (98.3–101.3) | 103.7 | 66.6 / 102.9 | 3 |
| status | 0.4.1-studio.7 | 15/15 | 252 (228–266) | 442 (410–464) | 168.9 (168.6–169.8) | 95.9 (95.5–96.8) | 101.9 | 65.1 / 103.5 | 3 |
| studio-starter | 0.4.1 | 1/1 | 225 (204–276) | 266 (246–321) | 139.5 (139.4–139.8) | 76.9 (76.7–77.1) | 78.6 | 42.0 / 73.9 | 3 |
| tasks | 0.4.1-studio.7 | 13/13 | 258 (249–286) | 353 (334–372) | 171.7 (169.6–173.7) | 102.9 (100.9–104.9) | 107.7 | 69.6 / 105.9 | 3 |
| timesheets | 0.4.1-studio.7 | 12/12 | 261 (233–287) | 347 (317–381) | 168.2 (167.5–168.9) | 93.7 (92.9–94.3) | 98.6 | 63.6 / 102.6 | 3 |
| wiki | 0.4.1-studio.7 | 19/19 | 250 (228–305) | 343 (307–401) | 171.0 (170.8–171.6) | 101.8 (101.7–102.5) | 108.5 | 68.9 / 105.4 | 3 |
| ref-forms | 0.4.0 | 3/3 | 288 (256–350) | 540 (485–621) | 188.3 (188.0–189.1) | 113.7 (113.5–114.5) | 126.9 | 83.6 / 122.6 | 3 |
| ref-perseus-starter | 0.4.1 | 1/1 | 194 (178–207) | 208 (191–223) | 134.5 (134.4–134.7) | 66.4 (66.3–66.5) | 66.4 | 34.3 / 68.9 | 3 |

Notes:

- expenses: pages not 200: /chest/expenses/101 → 404
- hiring: pages not 200: /chest/mail → 404
- ref-forms: npm ci did not finish under 512 MiB and 1 CPU (SIGKILL, killed for memory); installed again without limits
- ref-perseus-starter: vendor/chest-sdk-0.4.1.tgz is not in the source: packed @argentic/chest-sdk@0.4.1 from npm into vendor/

## before-next16-final → after-mail

Medians. PSS at rest and peak in MiB, first 200 in ms, image in MiB.

| Tool | PSS at rest | Peak PSS | First 200 | Image | Build fits 512 MiB |
|---|--:|--:|--:|--:|---|
| booking | 149.9 → 105.2 (−30 %) | 186.3 → 111.4 (−40 %) | 653 → 326 (−50 %) | 461 → 32 (−93 %) | no → yes |
| crm | 148.8 → 96.6 (−35 %) | 191.9 → 104.2 (−46 %) | 728 → 487 (−33 %) | 462 → 33 (−93 %) | no → yes |
| equipment | 153.8 → 95.0 (−38 %) | 176.9 → 101.9 (−42 %) | 744 → 383 (−49 %) | 459 → 30 (−93 %) | yes → yes |
| expenses | 144.2 → 95.1 (−34 %) | 177.5 → 98.4 (−45 %) | 709 → 365 (−48 %) | 514 → 34 (−93 %) | no → yes |
| forms | 149.0 → 96.4 (−35 %) | 178.7 → 99.9 (−44 %) | 722 → 344 (−52 %) | 469 → 40 (−91 %) | yes → yes |
| goals | 149.4 → 101.1 (−32 %) | 183.8 → 105.0 (−43 %) | 635 → 348 (−45 %) | 457 → 29 (−94 %) | yes → yes |
| helpdesk | 143.0 → 94.7 (−34 %) | 171.2 → 97.7 (−43 %) | 783 → 344 (−56 %) | 460 → 31 (−93 %) | yes → yes |
| hiring | 143.1 → 97.2 (−32 %) | 177.8 → 101.2 (−43 %) | 764 → 330 (−57 %) | 463 → 34 (−93 %) | yes → yes |
| leave | 134.4 → 101.5 (−24 %) | 183.2 → 107.0 (−42 %) | 676 → 319 (−53 %) | 455 → 27 (−94 %) | yes → yes |
| news | 142.9 → 99.7 (−30 %) | 175.9 → 103.1 (−41 %) | 691 → 329 (−52 %) | 475 → 28 (−94 %) | no → yes |
| people | 144.4 → 95.3 (−34 %) | 180.0 → 99.5 (−45 %) | 719 → 336 (−53 %) | 460 → 31 (−93 %) | yes → yes |
| polls | 152.1 → 99.2 (−35 %) | 182.7 → 104.0 (−43 %) | 649 → 341 (−47 %) | 458 → 30 (−94 %) | yes → yes |
| quotes | 138.4 → 97.0 (−30 %) | 173.6 → 100.8 (−42 %) | 771 → 325 (−58 %) | 464 → 34 (−93 %) | no → yes |
| rooms | 152.4 → 99.8 (−35 %) | 172.2 → 103.7 (−40 %) | 807 → 375 (−54 %) | 461 → 32 (−93 %) | yes → yes |
| status | 173.3 → 95.9 (−45 %) | 241.2 → 101.9 (−58 %) | 833 → 442 (−47 %) | 463 → 32 (−93 %) | yes → yes |
| tasks | 154.0 → 102.9 (−33 %) | 186.6 → 107.7 (−42 %) | 640 → 353 (−45 %) | 461 → 33 (−93 %) | yes → yes |
| timesheets | 153.6 → 93.7 (−39 %) | 186.1 → 98.6 (−47 %) | 663 → 347 (−48 %) | 458 → 30 (−94 %) | yes → yes |
| wiki | 154.6 → 101.8 (−34 %) | 188.5 → 108.5 (−42 %) | 733 → 343 (−53 %) | 485 → 39 (−92 %) | no → yes |
| ref-forms | 114.1 → 113.7 (−0 %) | 127.4 → 126.9 (−0 %) | 572 → 540 (−6 %) | 443 → 443 (+0 %) | yes → yes |
| ref-perseus-starter | 67.1 → 66.4 (−1 %) | 67.1 → 66.4 (−1 %) | 196 → 208 (+6 %) | 13 → 13 (+0 %) | yes → yes |

