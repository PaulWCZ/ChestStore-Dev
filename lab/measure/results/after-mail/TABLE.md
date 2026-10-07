## after-mail

Machine: Intel(R) Xeon(R) Processor, 4 CPUs, 16095 MiB, Linux 6.18.44-fc-v70, cgroups v1; Node v24.21.0, npm 11.19.0. Measured 2026-10-07T00:20Z → 2026-10-07T02:02Z, one tool at a time; load average (1 min) during the rests: 0.00–0.33.

### Image and build

Sizes in MiB (disk usage, `du -sk`). *node_modules*: after `npm ci` → after `npm prune --omit=dev` (what the image keeps). *Build*: what `build.command` left (of which a build cache). *npm ci*: run in a cgroup limited to 512 MiB and one CPU (with the npm cache of this machine warm): its time and cgroup peak, or **no** when the kernel killed it (then installed again without limit). Build peak: the process tree's PSS, sampled every 250 ms, on 4 CPUs without limit. *512 MiB, 1 CPU*: the same build in a cgroup limited to 512 MiB and one CPU — whether it finished, in how long, and its cgroup peak.

| Tool | Repository | node_modules | Build output | Image | npm ci (512 MiB, 1 CPU) | Build (4 CPUs) | Build peak PSS / RSS | 512 MiB, 1 CPU |
|---|--:|--:|--:|--:|--:|--:|--:|---|
| booking | 12.9 | 111 → 17 | 2 | 32 | 2.5 s, peak 287 | 2.1 s | 295 / 367 | fits, 4.2 s, peak 239 |
| crm | 10.8 | 114 → 19 | 3 | 33 | 3.5 s, peak 286 | 3.0 s | 350 / 390 | fits, 5.5 s, peak 304 |
| equipment | 11.1 | 112 → 17 | 2 | 30 | 3.2 s, peak 288 | 2.5 s | 324 / 396 | fits, 4.4 s, peak 269 |
| expenses | 10.2 | 168 → 17 | 7 | 34 | 5.0 s, peak 431 | 2.2 s | 304 / 376 | fits, 5.5 s, peak 250 |
| forms | 21.0 | 111 → 17 | 3 | 40 | 2.8 s, peak 285 | 2.5 s | 345 / 384 | fits, 4.9 s, peak 307 |
| goals | 9.9 | 111 → 17 | 2 | 29 | 2.8 s, peak 288 | 2.0 s | 287 / 340 | fits, 4.2 s, peak 265 |
| helpdesk | 12.6 | 111 → 17 | 2 | 31 | 2.5 s, peak 288 | 2.0 s | 267 / 326 | fits, 4.1 s, peak 259 |
| hiring | 12.4 | 114 → 19 | 3 | 34 | 3.4 s, peak 281 | 2.4 s | 332 / 404 | fits, 5.2 s, peak 294 |
| leave | 8.6 | 111 → 17 | 2 | 27 | 2.4 s, peak 288 | 1.9 s | 284 / 356 | fits, 3.6 s, peak 236 |
| news | 9.1 | 125 → 17 | 3 | 28 | 4.8 s, peak 314 | 2.6 s | 383 / 455 | fits, 5.4 s, peak 287 |
| people | 12.0 | 111 → 17 | 2 | 31 | 2.4 s, peak 279 | 2.2 s | 286 / 358 | fits, 4.9 s, peak 290 |
| polls | 11.0 | 111 → 17 | 2 | 30 | 2.5 s, peak 277 | 2.0 s | 267 / 335 | fits, 4.4 s, peak 242 |
| quotes | 14.8 | 111 → 17 | 3 | 34 | 3.3 s, peak 288 | 2.4 s | 368 / 399 | fits, 5.0 s, peak 321 |
| rooms | 12.9 | 111 → 17 | 2 | 32 | 3.2 s, peak 279 | 2.2 s | 277 / 349 | fits, 4.5 s, peak 271 |
| status | 13.6 | 111 → 17 | 2 | 32 | 2.3 s, peak 287 | 2.1 s | 291 / 362 | fits, 3.7 s, peak 252 |
| tasks | 11.1 | 114 → 19 | 3 | 33 | 2.6 s, peak 284 | 2.3 s | 354 / 426 | fits, 4.5 s, peak 270 |
| timesheets | 11.0 | 111 → 17 | 2 | 30 | 3.0 s, peak 287 | 2.2 s | 267 / 325 | fits, 4.9 s, peak 262 |
| wiki | 14.4 | 131 → 21 | 3 | 39 | 5.4 s, peak 328 | 3.1 s | 399 / 471 | fits, 6.8 s, peak 290 |
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
| goals | 0.4.1-studio.7 | 12/12 | 274 (252–306) | 374 (352–417) | 168.7 (167.3–169.8) | 93.8 (92.4–94.9) | 97.8 | 63.6 / 103.0 | 3 |
| helpdesk | 0.4.1-studio.7 | 14/14 | 254 (233–275) | 344 (322–383) | 169.3 (167.8–169.5) | 94.7 (93.1–94.9) | 97.7 | 64.5 / 103.6 | 3 |
| hiring | 0.4.1-studio.7 | 16/17 | 254 (236–437) | 330 (311–533) | 171.9 (171.2–172.6) | 97.2 (96.4–97.9) | 101.2 | 67.1 / 106.3 | 3 |
| leave | 0.4.1-studio.7 | 10/10 | 248 (226–302) | 335 (301–413) | 169.1 (167.3–170.6) | 94.3 (92.6–96.0) | 98.7 | 64.2 / 103.5 | 3 |
| news | 0.4.1-studio.7 | 14/15 | 269 (247–327) | 377 (343–442) | 168.0 (167.7–168.5) | 93.3 (93.0–93.7) | 96.7 | 63.3 / 102.6 | 3 |
| people | 0.4.1-studio.7 | 20/20 | 259 (236–289) | 336 (309–398) | 169.9 (169.2–170.6) | 95.3 (94.5–96.0) | 99.5 | 65.3 / 104.5 | 3 |
| polls | 0.4.1-studio.7 | 10/10 | 265 (233–279) | 348 (312–399) | 167.8 (166.6–168.1) | 93.1 (92.0–93.5) | 100.0 | 63.0 / 102.2 | 3 |
| quotes | 0.4.1-studio.7 | 13/13 | 246 (233–266) | 325 (316–514) | 171.7 (168.1–175.9) | 97.0 (93.4–101.2) | 100.8 | 66.8 / 106.0 | 3 |
| rooms | 0.4.1-studio.7 | 7/7 | 254 (236–276) | 367 (336–455) | 167.1 (166.5–168.3) | 92.5 (91.9–93.6) | 95.5 | 62.4 / 101.6 | 3 |
| status | 0.4.1-studio.7 | 15/15 | 252 (228–266) | 442 (410–464) | 168.9 (168.6–169.8) | 95.9 (95.5–96.8) | 101.9 | 65.1 / 103.5 | 3 |
| tasks | 0.4.1-studio.7 | 13/13 | 266 (236–320) | 354 (319–418) | 170.6 (169.7–172.7) | 96.0 (95.0–98.0) | 101.1 | 65.6 / 104.8 | 3 |
| timesheets | 0.4.1-studio.7 | 12/12 | 261 (233–287) | 347 (317–381) | 168.2 (167.5–168.9) | 93.7 (92.9–94.3) | 98.6 | 63.6 / 102.6 | 3 |
| wiki | 0.4.1-studio.7 | 19/19 | 284 (250–337) | 367 (330–467) | 170.3 (169.8–171.0) | 95.3 (95.0–96.2) | 98.8 | 65.3 / 104.6 | 3 |
| ref-forms | 0.4.0 | 3/3 | 288 (256–350) | 540 (485–621) | 188.3 (188.0–189.1) | 113.7 (113.5–114.5) | 126.9 | 83.6 / 122.6 | 3 |
| ref-perseus-starter | 0.4.1 | 1/1 | 194 (178–207) | 208 (191–223) | 134.5 (134.4–134.7) | 66.4 (66.3–66.5) | 66.4 | 34.3 / 68.9 | 3 |

Notes:

- expenses: pages not 200: /chest/expenses/101 → 404
- hiring: pages not 200: /chest/mail → 404
- news: pages not 200: /chest/posts/8 → 404
- ref-forms: npm ci did not finish under 512 MiB and 1 CPU (SIGKILL, killed for memory); installed again without limits
- ref-perseus-starter: vendor/chest-sdk-0.4.1.tgz is not in the source: packed @argentic/chest-sdk@0.4.1 from npm into vendor/

