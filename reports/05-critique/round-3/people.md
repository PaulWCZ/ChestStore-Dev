# People (Équipe) — severe critique, round 3

Tested 2026-09-29, port 11300: `--prod --reset` and `--prod --reset --empty`. Camille (HR, FR and EN), Hugo (member: HR routes, Nora's profile, brand:port chart), Nora (FR phone: own profile, to-dos), Léa (FR phone dark, brand:port). Also run: a BambooHR-style CSV import (`Employee #, Division, T-Shirt Size` unknown), and the register, numbers and records pages. Scripts and shots: `critique3/hr/pp*.mjs`, `hr/shots/pp*`.

## Verdict

**Can a 50-person French company cancel BambooHR / Lucca Core HR tomorrow? Not yet.** All three round-2 fixes landed. The register can no longer mislead an inspector, the numbers agree, and the import says what it leaves out. What a paying customer would miss weekly:
- documents generated from templates (certificat de travail, attestation employeur, avenants), with e-signature;
- employees updating their own address or emergency contact;
- a migration path for the HR records themselves;
- the sealed-data answer to "who can read our employees' addresses".

A new privacy leak is shown by the tool's own sample (see N1).

**Completeness 4 → 7 → 7.5 /10 (as a directory 8 → 9 → 9) · UX 8 → 8.5 → 8.5 /10.**

Strength: the register now names who is missing ("ABSENTS DE CE REGISTRE · Hugo Bernard · Pas de dossier RH · Créer le dossier") on screen, on paper and in the CSV.

## Round-2 top fixes and blockers

- The register hides a missing employee: **fixed.** The top warning reads "1 personne qui travaille ici manque dans ce registre", followed by an "Absents de ce registre" part. The intern's tutor shows as "Inès Moreau", with no suffix.
- One population for Numbers: **fixed.** "9 People working here". By team (3+2+2+2), by office and by contract (5+1+1+1 + "No HR record yet 1") each add up to 9, and the page says what it counts.
- The import states what it leaves out: **fixed.** "3 columns are left out: Employee #, Division, T-Shirt Size", with the mapping open and *Keep as a new field*.
- Date and choice extra fields with alerts: **fixed** ("Medical visit" as a date field on Nora's profile).
- N6, HR's empty first run: **fixed** ("Mettre en place Équipe : 3 étapes"; records "Créer leurs 7 dossiers").
- Blocker, encryption at rest and a role builders don't get: **not fixed** (platform).
- Blocker, documents from templates and e-signature: **not fixed.**
- Blocker, dated history of job and contract changes: **not fixed.** The journal still names fields, never values.

## Still blocking (what a BambooHR / Factorial / Lucca customer misses weekly)

1. **No generated documents.** A certificat de travail and an attestation employeur (France Travail) at every departure, and an avenant at every change. BambooHR and Factorial make them from templates with merge fields. Here HR writes them in Word and uploads the PDF. A template with {name}, {job}, {entry date}, {exit date} is tool-side work.
2. **Employees cannot change their own details.** The record is read-only to its person. A move, a new phone or a new emergency contact means an email to HR, who retypes it. BambooHR and Factorial offer "request a change" with HR approval.
3. **No import of HR records.** The import fills profiles only (job, team, manager, start date). The ~15 register fields of 50 people (legal names, birth date, nationality, contract, qualification, permit) must be typed by hand. "Créer leurs N dossiers" pre-fills only name, job and start date. This is the single biggest switching cost from Lucca or BambooHR.
4. **The work permit has no expiry date and no alert.** "Carte de séjour « salarié » n° 7512345678" is stored with no validity end. An employer must check its foreign workers' permits are valid (employing someone without one is an offence). BambooHR tracks expiring visas. The same "Coming up" mechanism as trial periods would do.
5. **The directory and org chart leave out people without the Chest.** DIALLO Aminata (warehouse) and NGUYEN Linh (intern) have HR records but appear in no chart, no directory and no "who's who". For a company with frontline staff, the org chart is wrong.
6. **Salary and its history: never, by design.** That is defensible, but BambooHR customers use the compensation tab weekly. The pitch must say so.

## New problems

- **N1 — Privacy: HR's date field "Medical visit" is shown to every colleague.** Steps: seed → sign in as Hugo (member) → Nora's profile. Under "MORE" it shows "Medical visit · 19 October 2026". The README itself suggests this field ("Medical visit", the *visite d'information et de prévention*), and extra fields have no "HR only" visibility (listed under "does not do": field-level visibility). Occupational-health follow-up is sensitive HR data that a peer must not read. Add a third visibility, "HR and the person only", and make it the default for date fields. The seed should show that.
- **N2 — No matricule (employee number) in the HR record**, while Leave, payroll exports and the Lucca import all key on it. The import even drops "Employee #" by default. The one identifier the other HR tools need lives in Leave, not in People.
- **N3 — Suite silos.** People emits `people.leaving`, but Leave does not receive it. People holds the contract (part time, hours per week), but Leave's "works on" is typed separately. Equipment's "everything back" still does not tick the leaving checklist. "Suite, not silos" is brief/01's argument, and in the HR trio it is only half built.
- **N4 — The import cannot create anyone.** "Julie Faure · Nobody by that name here" is simply left out. A person without the Chest (warehouse, intern), or an upcoming arrival, cannot come from the file. Offer "Add as an expected arrival" or "Create an HR record".
- **N5 — Numbers counts an intern arrival in turnover** (14.3 % = 2 arrivals incl. NGUYEN Linh / 2 / 7). The French *taux de rotation* is usually computed on employees (CDI, often CDD) and excludes interns, who are not employees. Show "interns excluded", or make it a choice.
- Looks: own, brand:port (chart; arches stay, as round 2 said), brand dark phone and FR phone are all readable. No overflow at 390 px. Hugo gets 404 on `/chest/records`.

## Platform-dependent

- `secrets.seal/open` and a role never given to builders (sensitive fields: address, permit, birth date).
- A qualified e-signature connector (Yousign or Docusign-like) for contracts and avenants. Generation itself is tool-side.
- `mail`: a welcome email before day 1, and step reminders to owners who never open the Chest. Already in `sdk/`, and People does not declare it.
- Events: already built. People → Leave (leaving, start date, hours, matricule) and Equipment → People ("all back") are tool work.

## Top 3 fixes now

1. **Field visibility "HR and the person"**, default for date fields, with the seeded "Medical visit" switched to it. Add a **work-permit expiry date** with a "Coming up" alert 60 days ahead, and a **matricule** field on the record. **S.**
2. **Import HR records** from Lucca, BambooHR or a spreadsheet: the register fields, matched by work email, matricule or name, with the same mapping step. Rows without a Chest member become records "Not in the Chest". **M.**
3. **Documents from templates:** HR writes a template once with merge fields and People prints a certificat de travail or attestation from the record (the "Paper" print layout already exists). Also a "Request a change" on My HR record for address, phone and emergency contact, approved by HR. **M.**
