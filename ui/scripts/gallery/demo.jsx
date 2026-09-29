// The components gallery's demos (ui/gallery/components.html): rendered on
// the server by build-gallery.mjs (react-dom/server), then hydrated in the
// page — which proves, in a real browser, that the kit's components render
// the same on both sides (a mismatch is shown in red at the top). The
// components come from dist/, as a tool receives them; every word of a
// component comes from the kit's words (en, fr) or from the demo's words
// below, which play the part of a tool's catalogue.
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  AppShell, AvatarStack, Avatar, Calendar, Checkbox, Confirm, DataTable, DateField, DateRangeField, DayStrip, Dialog, EmptyState, FilePicker, Filters, LanguageSwitch,
  Menu, MonthField, NoAccess, PageHeader, PeoplePicker, SearchBox, Segmented, StatusBadge, storedFile, Switch, Tabs, TimeSelect, Toasts, useToast,
} from "../../dist/components/index.js";
import { addDays, en, fill, formatDate, fr, matches, moveEnd, moveStart, rangeDays, storeLanguages } from "../../dist/components/logic.js";

export const demoWords = {
  en: {
    toast: "Toast — Undo that tells the truth",
    toastIntro: "Hover or tab into a toast: it waits. Undo runs once and says whether it worked. An email already sent never offers Undo. Ctrl+Z works too.",
    deleteNote: "Delete a note", noteDeleted: "Note deleted.",
    moveCard: "Move a card", movedTo: "Card moved to {column}.", columns: ["Doing", "Done", "Review"],
    sendInvite: "Send the invitation", inviteSent: "Invitation sent to Léa. It can’t be undone: the email left.",
    stopTimer: "Stop the timer", stopped: "Timer stopped at 1 min 12 s.", keep: "Keep 1 min", kept: "Kept: 1 min.",
    failing: "Undo that fails", archived: "Board archived.", tooLate: "Someone changed the board since: nothing was undone.",
    dialog: "Dialog", dialogIntro: "Opens on its first field. Type something, then press Escape or click outside: it asks before losing it.",
    newBoard: "New board", boardStart: "Starts on", boardName: "Name", boardHint: "You can change it later.", create: "Create", cancel: "Cancel",
    erase: "Erase Léa’s data", eraseTitle: "Erase Léa Moreau’s data?", eraseBody: "Her answers and her name are erased for good. This cannot be undone.", eraseConfirm: "Erase", erased: "Léa’s data erased.",
    people: "People picker", peopleIntro: "Type “lé” or “sal”. Arrows, Enter, Escape; Backspace takes a chip away.",
    owner: "Owner", guests: "Guests", formSent: "Form sent ({n}).", sendForm: "Send the form", guestsHint: "People or a whole group.",
    dates: "Dates and times", datesIntro: "Type “29/10”, “3 oct” or “tomorrow”, or open the calendar (arrows, Page Up/Down). Moving the start keeps the meeting’s length.",
    due: "Due", start: "Starts", end: "Ends", day: "Day", month: "Month", saveDue: "Save the date", dueSaved: "Saved: {date}.",
    files: "Files", filesIntro: "Several files, limits stated first, progress while they go, each one removable. (The upload is simulated here.)",
    receipts: "Receipts",
    table: "Table, filters and search", tableIntro: "Sort by a column, filter by one state or several (the address would keep them), search with “/”.",
    client: "Client", amount: "Amount", state: "State", issued: "Issued", quotes: "Quotes", filterState: "State",
    states: { draft: "Draft", sent: "Sent", paid: "Paid", late: "Late" },
    duplicate: "Duplicate", download: "Download PDF", delete: "Delete",
    noQuotes: "No quote matches", noQuotesBody: "Try another word, or clear the filters.",
    bits: "Empty state, avatars, badges, tabs", emptyTitle: "No rooms yet", emptyBody: "Rooms are the places people book: meeting rooms, desks, the van.",
    addRoom: "Add a room", emptyNote: "Only an admin adds rooms.", booking: "Bookings", upcoming: "Upcoming", past: "Past", cancelled: "Cancelled",
    view: "View", layout: "Layout (locked)", board: "Board", list: "List", morning: "Morning", afternoon: "Afternoon", allDay: "All day", when: "When",
    shell: "App shell and navigation", shellIntro: "Labelled tabs, never icons alone: in the header on a wide screen, in a row of their own on a phone. The page’s main action sits at the top.",
    home: "Home", myTasks: "My tasks", boards: "Boards", companies: "Companies", settings: "Settings", manager: "Manager", newTask: "New task", tasksIntro: "What waits for you today.", language: "Language",
    noAccess: "When the role gives nothing",
    removeTemplate: "Delete the template", removeTemplateTitle: "Delete the “Sprint” template?", removeTemplateBody: "Boards made from it keep their columns.", templateRemoved: "Template deleted.",
    daysOff: "Days off", daysOffIntro: "Choose several days.", category: "Category", categories: ["Hardware", "Software", "Travel", "Training", "Office", "Other"],
    export: "Export", exportNote: "The rows shown, as a spreadsheet", exportCsv: "Download CSV", openBoard: "Open the board", sameName: "Léa Moreau", sameNameNote: "Accounts, Paris", sameNameNote2: "Sales, Lyon", assignTo: "Give to",
    trip: "Trip", notify: "Email me when someone answers", notifyHint: "One email a day at most.", noOwner: "No owner yet", laptop: "Laptop",
    back: "Back on", weekLater: "A week later", leave: "Leave", whole: "Whole day", afternoonOnly: "From noon", morningOnly: "Until noon", workingDays: "Days off: {n}",
    period: "Period", photos: "Photos of the damage", billable: "Billable", billableHint: "Saved with the entry, when you press Save.",
    owner2: "Owner", itemKind: "Item", anyone: "Anyone", team: "Team", others: "Others", everyCategory: "Every category", hardware: "Hardware", software: "Software",
    items: ["Laptop", "Screen", "Dock", "Licence", "Chair"], shown: "{n} shown", panel: "A band of its own colour", running: "Running", startTimer: "Start", timer: "Timer",
  },
  fr: {
    toast: "Toast — une annulation qui dit vrai",
    toastIntro: "Survolez un toast ou atteignez-le au clavier : il attend. « Annuler l’action » ne sert qu’une fois et dit si cela a marché. Un e-mail déjà parti ne propose jamais d’annuler. Ctrl+Z marche aussi.",
    deleteNote: "Supprimer une note", noteDeleted: "Note supprimée.",
    moveCard: "Déplacer une carte", movedTo: "Carte déplacée dans {column}.", columns: ["En cours", "Terminé", "À relire"],
    sendInvite: "Envoyer l’invitation", inviteSent: "Invitation envoyée à Léa. Impossible d’annuler : l’e-mail est parti.",
    stopTimer: "Arrêter le chrono", stopped: "Chrono arrêté à 1 min 12 s.", keep: "Garder 1 min", kept: "Gardé\u202f: 1 min.",
    failing: "Annulation qui échoue", archived: "Tableau archivé.", tooLate: "Quelqu’un a modifié le tableau entre-temps : rien n’a été annulé.",
    dialog: "Fenêtre de dialogue", dialogIntro: "S’ouvre sur son premier champ. Tapez quelque chose, puis Échap ou un clic à côté : elle demande avant de tout perdre.",
    newBoard: "Nouveau tableau", boardStart: "Commence le", boardName: "Nom", boardHint: "Vous pourrez le changer.", create: "Créer", cancel: "Annuler",
    erase: "Effacer les données de Léa", eraseTitle: "Effacer les données de Léa Moreau ?", eraseBody: "Ses réponses et son nom sont effacés pour de bon. C’est définitif.", eraseConfirm: "Effacer", erased: "Données de Léa effacées.",
    people: "Choix de personnes", peopleIntro: "Tapez « lé » ou « com ». Flèches, Entrée, Échap ; Retour arrière retire une pastille.",
    owner: "Responsable", guests: "Invités", formSent: "Formulaire envoyé ({n}).", sendForm: "Envoyer le formulaire", guestsHint: "Des personnes ou tout un groupe.",
    dates: "Dates et heures", datesIntro: "Tapez « 29/10 », « 3 oct » ou « demain », ou ouvrez le calendrier (flèches, Page préc./suiv.). Déplacer le début garde la durée de la réunion.",
    due: "Échéance", start: "Début", end: "Fin", day: "Jour", month: "Mois", saveDue: "Enregistrer la date", dueSaved: "Enregistré\u202f: {date}.",
    files: "Fichiers", filesIntro: "Plusieurs fichiers, les limites dites d’abord, la progression pendant l’envoi, chacun peut être retiré. (L’envoi est simulé ici.)",
    receipts: "Justificatifs",
    table: "Tableau, filtres et recherche", tableIntro: "Triez par colonne, filtrez par un état ou plusieurs (l’adresse les garderait), cherchez avec « / ».",
    client: "Client", amount: "Montant", state: "État", issued: "Émis le", quotes: "Devis", filterState: "État",
    states: { draft: "Brouillon", sent: "Envoyé", paid: "Payé", late: "En retard" },
    duplicate: "Dupliquer", download: "Télécharger le PDF", delete: "Supprimer",
    noQuotes: "Aucun devis ne correspond", noQuotesBody: "Essayez un autre mot, ou retirez les filtres.",
    bits: "État vide, avatars, badges, onglets", emptyTitle: "Pas encore de salle", emptyBody: "Les salles sont les lieux que l’on réserve : salles de réunion, bureaux, la camionnette.",
    addRoom: "Ajouter une salle", emptyNote: "Seul un administrateur ajoute des salles.", booking: "Réservations", upcoming: "À venir", past: "Passées", cancelled: "Annulées",
    view: "Affichage", layout: "Mise en page (verrouillée)", board: "Tableau", list: "Liste", morning: "Matin", afternoon: "Après-midi", allDay: "Journée", when: "Quand",
    shell: "Cadre et navigation", shellIntro: "Des onglets avec leurs mots, jamais des icônes seules : dans l’en-tête sur grand écran, sur une ligne à eux sur téléphone. L’action principale de la page est en haut.",
    home: "Accueil", myTasks: "Mes tâches", boards: "Tableaux", companies: "Entreprises", settings: "Réglages", manager: "Responsable", newTask: "Nouvelle tâche", tasksIntro: "Ce qui vous attend aujourd’hui.", language: "Langue",
    noAccess: "Quand le rôle ne donne rien",
    removeTemplate: "Supprimer le modèle", removeTemplateTitle: "Supprimer le modèle « Sprint » ?", removeTemplateBody: "Les tableaux créés avec lui gardent leurs colonnes.", templateRemoved: "Modèle supprimé.",
    daysOff: "Jours de congé", daysOffIntro: "Choisissez plusieurs jours.", category: "Catégorie", categories: ["Matériel", "Logiciel", "Déplacement", "Formation", "Bureau", "Autre"],
    export: "Exporter", exportNote: "Les lignes affichées, en tableur", exportCsv: "Télécharger le CSV", openBoard: "Ouvrir le tableau", sameName: "Léa Moreau", sameNameNote: "Comptabilité, Paris", sameNameNote2: "Ventes, Lyon", assignTo: "Donner à",
    trip: "Déplacement", notify: "M’écrire quand quelqu’un répond", notifyHint: "Un e-mail par jour au plus.", noOwner: "Pas encore de responsable", laptop: "Ordinateur portable",
    back: "De retour le", weekLater: "Une semaine plus tard", leave: "Congé", whole: "Journée entière", afternoonOnly: "À partir de midi", morningOnly: "Jusqu’à midi", workingDays: "Jours de congé\u202f: {n}",
    period: "Période", photos: "Photos des dégâts", billable: "Facturable", billableHint: "Enregistré avec la saisie, quand vous appuyez sur Enregistrer.",
    owner2: "Responsable", itemKind: "Objet", anyone: "Tout le monde", team: "Équipe", others: "Autres", everyCategory: "Toutes les catégories", hardware: "Matériel", software: "Logiciel",
    items: ["Ordinateur", "Écran", "Station d’accueil", "Licence", "Chaise"], shown: "{n} affichés", panel: "Une bande de sa propre couleur", running: "En cours", startTimer: "Démarrer", timer: "Chrono",
  },
};

const team = [
  { id: "mbr_camille", name: "Camille Martin", detail: "Office manager" },
  { id: "mbr_ines", name: "Inès Haddad", detail: "Sales" },
  { id: "mbr_hugo", name: "Hugo Bernard", detail: "Warehouse" },
  { id: "mbr_lea", name: "Léa Moreau", detail: "Accounts" },
  { id: "mbr_tom", name: "Tom Petit", detail: "Sales" },
  { id: "mbr_sofia", name: "Sofia Rossi", detail: "Design" },
  { id: "mbr_nora", name: "Nora Diallo", detail: "Support" },
  { kind: "group", id: "grp_sales", name: "Sales", size: 3 },
  { kind: "group", id: "grp_all", name: "Everyone", size: 7 },
];
const teamFr = team.map(p => (p.id === "grp_sales" ? { ...p, name: "Commercial" } : p.id === "grp_all" ? { ...p, name: "Tout le monde" } : p));

const quotes = [
  { id: "Q-2026-014", client: "Atelier Martin", amount: 1240, state: "sent", issued: 3 },
  { id: "Q-2026-015", client: "Boulangerie Léa", amount: 380.5, state: "paid", issued: 12 },
  { id: "Q-2026-016", client: "Garage Dupuis", amount: 5600, state: "late", issued: 40 },
  { id: "Q-2026-017", client: "Émile & fils", amount: 920, state: "draft", issued: 0 },
  { id: "Q-2026-018", client: "Café du Port", amount: 2150, state: "sent", issued: 6 },
];
const tone = { draft: "neutral", sent: "info", paid: "ok", late: "danger" };
// Money as a tool would format it on the server; here, the same on both sides.
const money = (n, lang) => {
  const [int, dec] = n.toFixed(2).split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/gu, lang === "fr" ? " " : ",");
  return lang === "fr" ? `${grouped},${dec} €` : `€${grouped}.${dec}`;
};

function Section({ id, title, intro, children }) {
  return (
    <section className="demo" aria-labelledby={id}>
      <h2 id={id} className="demo-title">{title}</h2>
      {intro ? <p className="demo-intro">{intro}</p> : null}
      <div className="demo-body">{children}</div>
    </section>
  );
}

function ToastDemo({ d, lang }) {
  const toast = useToast();
  const [moves, setMoves] = useState(0);
  return (
    <div className="demo-row">
      <button type="button" className="ck-button" onClick={() => toast({ id: "delete-note", text: d.noteDeleted, undo: () => new Promise(r => setTimeout(() => r(true), 600)) })}>{d.deleteNote}</button>
      <button type="button" className="ck-button ck-button-quiet" onClick={() => { const n = moves + 1; setMoves(n); toast({ id: "move-card", text: fill(d.movedTo, { column: d.columns[n % 3] }), undo: () => true }); }}>{d.moveCard}</button>
      <button type="button" className="ck-button ck-button-quiet" onClick={() => toast({ id: "invite", text: d.inviteSent, sent: true })}>{d.sendInvite}</button>
      <button type="button" className="ck-button ck-button-quiet" onClick={() => toast({ id: "timer", text: d.stopped, action: { label: d.keep, run: () => { toast({ id: "timer-kept", text: d.kept }); } } })}>{d.stopTimer}</button>
      <button type="button" className="ck-button ck-button-quiet" onClick={() => toast({ id: "archive", text: d.archived, undo: () => new Promise(r => setTimeout(() => r(d.tooLate), 500)) })}>{d.failing}</button>
      <span className="demo-note" lang={lang}>Ctrl+Z</span>
    </div>
  );
}

function DialogDemo({ d, w, lang, today }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const list = lang === "fr" ? teamFr : team;
  const search = useMemo(() => q => new Promise(r => setTimeout(() => r(list.filter(p => matches(p.name, q)).slice(0, 8)), 120)), [list]);
  const [owner, setOwner] = useState([]);
  const [start, setStart] = useState(null);
  const [erase, setErase] = useState(false);
  const [template, setTemplate] = useState(false);
  const close = () => { setOpen(false); setName(""); };
  return (
    <div className="demo-row">
      <button type="button" className="ck-button" onClick={() => setOpen(true)}>{d.newBoard}</button>
      <button type="button" className="ck-button ck-button-quiet" onClick={() => setErase(true)}>{d.erase}</button>
      <Dialog open={open} title={d.newBoard} onClose={close} dirty={name.trim() !== ""} labels={w.dialog}
        footer={<><button type="button" className="ck-button ck-button-quiet" onClick={close}>{d.cancel}</button><button type="button" className="ck-button" onClick={close}>{d.create}</button></>}>
        <div>
          <label className="ck-label" htmlFor={`${lang}-board-name`}>{d.boardName}</label>
          <input id={`${lang}-board-name`} className="ck-field" value={name} onChange={e => setName(e.target.value)} aria-describedby={`${lang}-board-hint`} />
          <p id={`${lang}-board-hint`} className="ck-hint">{d.boardHint}</p>
        </div>
        {/* A list and a calendar inside a dialog are never cut at its edge. */}
        <PeoplePicker label={d.owner} search={search} value={owner} onChange={setOwner} suggestions={list.slice(0, 7)} suggestionsLabel={w.peoplePicker.suggested} labels={w.peoplePicker} lang={lang} />
        <DateField label={d.boardStart} value={start} onChange={setStart} today={today} labels={w.date} />
        {/* A Confirm opened from a Dialog: closing it leaves the Dialog open (0.2.2). */}
        <div><button type="button" className="ck-button ck-button-quiet ck-button-small" onClick={() => setTemplate(true)}>{d.removeTemplate}</button></div>
        <Confirm open={template} title={d.removeTemplateTitle} body={d.removeTemplateBody} confirmLabel={d.removeTemplate} cancelLabel={d.cancel} onCancel={() => setTemplate(false)} onConfirm={() => { setTemplate(false); toast({ id: "template", text: d.templateRemoved }); }} />
      </Dialog>
      <Confirm open={erase} title={d.eraseTitle} body={d.eraseBody} confirmLabel={d.eraseConfirm} cancelLabel={d.cancel} onCancel={() => setErase(false)} onConfirm={() => { setErase(false); toast({ text: d.erased, sent: true }); }} />
    </div>
  );
}

function PeopleDemo({ d, w, lang }) {
  const list = lang === "fr" ? teamFr : team;
  const search = useMemo(() => q => new Promise(r => setTimeout(() => r(list.filter(p => matches(p.name, q)).slice(0, 8)), 120)), [list]);
  const [owner, setOwner] = useState([list[3]]);
  const [guests, setGuests] = useState([list[1], list[7]]);
  const [sent, setSent] = useState(0);
  // In a form: Enter in the picker chooses, it never sends the form.
  return (
    <form className="demo-stack-s" onSubmit={e => { e.preventDefault(); setSent(n => n + 1); }}>
      <div className="demo-grid">
        <PeoplePicker label={d.owner} search={search} value={owner} onChange={setOwner} clearable suggestions={[list[0], list[3]]} labels={w.peoplePicker} lang={lang} />
        <PeoplePicker label={d.guests} search={search} value={guests} onChange={setGuests} multiple hint={d.guestsHint} suggestions={[list[4], list[5], list[8]]} suggestionsLabel={w.peoplePicker.suggested} labels={w.peoplePicker} lang={lang} />
      </div>
      <div className="demo-row">
        <button type="submit" className="ck-button ck-button-quiet">{d.sendForm}</button>
        <p className="demo-note" role="status">{sent ? fill(d.formSent, { n: sent }) : ""}</p>
      </div>
    </form>
  );
}

function DatesDemo({ d, w, today, lang }) {
  const [due, setDue] = useState(addDays(today, 3));
  const [slot, setSlot] = useState({ start: 540, end: 600 });
  const [day, setDay] = useState(today);
  const [saved, setSaved] = useState(null);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [off, setOff] = useState([addDays(today, 7), addDays(today, 8)]);
  const [trip, setTrip] = useState({ from: addDays(today, 14), to: addDays(today, 16) });
  const days = Array.from({ length: 10 }, (_, i) => addDays(today, i));
  // A button right under the field: typing a date then clicking it at once
  // must hit it (the date in words appears on blur; its line is reserved).
  // A form, as a tool's: a day before min stops its submit (0.2.4).
  return (
    <div className="demo-grid">
      <form className="demo-stack-s" onSubmit={e => { e.preventDefault(); setSaved(due); }}>
        <DateField label={d.due} value={due} onChange={setDue} today={today} min={today} labels={w.date} />
        <div className="demo-row">
          <button type="submit" className="ck-button ck-button-quiet">{d.saveDue}</button>
          <p className="demo-note" role="status">{saved ? fill(d.dueSaved, { date: formatDate(saved, w.date, "long") }) : ""}</p>
        </div>
      </form>
      <MonthField label={d.month} value={month} onChange={setMonth} today={today} labels={w.date} />
      <DateRangeField label={d.trip} value={trip} onChange={setTrip} today={today} min={today} labels={w.date} lang={lang} />
      <BackDemo d={d} w={w} today={today} />
      <LeaveDemo d={d} w={w} today={today} lang={lang} />
      <div className="demo-times">
        <div><label className="ck-label" htmlFor={`${lang}-start`}>{d.start}</label><TimeSelect id={`${lang}-start`} value={slot.start} onChange={s => setSlot(moveStart(slot, s))} /></div>
        <div><label className="ck-label" htmlFor={`${lang}-end`}>{d.end}</label><TimeSelect id={`${lang}-end`} value={slot.end} onChange={e => setSlot(moveEnd(slot, e))} end /></div>
      </div>
      <div className="demo-wide">
        <span className="ck-label" aria-hidden="true">{d.day}</span>
        <DayStrip days={days} current={day} today={today} onPick={setDay} labels={w.date} label={d.day} />
      </div>
      <div>
        <p className="ck-label" id={`${lang}-days-off`}>{d.daysOff}</p>
        <Calendar value={null} today={today} multiple inline selected={off} labelledBy={`${lang}-days-off`} labels={w.date} onPick={iso => setOff(o => (o.includes(iso) ? o.filter(x => x !== iso) : [...o, iso]))} />
      </div>
    </div>
  );
}

// The Leave race (0.2.3): a value changed from outside — here after an
// await, as a server's answer lands — is the field's text in the very
// commit that carries it, so what one types next is never mixed with it.
// The probe (read by check-flows.mjs) writes the text the field shows when
// React commits the new value: 0.2.2 still showed the old one there, and
// set the new one in an effect, later.
function BackDemo({ d, w, today }) {
  const [back, setBack] = useState(addDays(today, 5));
  const box = useRef(null);
  useLayoutEffect(() => {
    const input = box.current?.querySelector("input.ck-date-input");
    if (!input) return;
    box.current.dataset.commitText = input.value;
    box.current.dataset.commitWant = back ? formatDate(back, w.date) : "";
  }, [back, w]);
  return (
    <div className="demo-stack-s" ref={box} data-probe="back">
      <DateField label={d.back} value={back} onChange={setBack} today={today} labels={w.date} chips={false} />
      <div className="demo-row">
        <button type="button" className="ck-button ck-button-quiet" onClick={() => { Promise.resolve().then(() => setBack(b => addDays(b ?? today, 7))); }}>{d.weekLater}</button>
      </div>
    </div>
  );
}

// A leave (0.2.3's DateRangeField): the first day's chips, the fields' own
// ids, half days under each end, and the tool's own count; and a filter's
// period, whose end stays where it is when the start moves (keepLength).
function LeaveDemo({ d, w, today, lang }) {
  const [range, setRange] = useState({ from: addDays(today, 21), to: addDays(today, 23) });
  const [first, setFirst] = useState("whole");
  const [last, setLast] = useState("whole");
  const [period, setPeriod] = useState({ from: addDays(today, -30), to: today });
  const days = rangeDays(range);
  const n = days === null ? null : days - (first === "half" ? 0.5 : 0) - (last === "half" && days > 1 ? 0.5 : 0);
  const count = n === null ? "" : fill(d.workingDays, { n: lang === "fr" ? String(n).replace(".", ",") : String(n) });
  return (
    <>
      <DateRangeField label={d.leave} value={range} onChange={setRange} today={today} min={today} labels={w.date} lang={lang} chips
        ids={{ from: `${lang}-leave-from`, to: `${lang}-leave-to` }} length={count}
        below={{
          from: <Segmented label={`${d.leave}, ${w.date.rangeFrom}`} value={first} onChange={setFirst} options={[{ value: "whole", label: d.whole }, { value: "half", label: d.afternoonOnly }]} />,
          to: <Segmented label={`${d.leave}, ${w.date.rangeTo}`} value={last} onChange={setLast} options={[{ value: "whole", label: d.whole }, { value: "half", label: d.morningOnly }]} />,
        }} />
      <DateRangeField label={d.period} value={period} onChange={setPeriod} today={today} labels={w.date} lang={lang} keepLength={false} hideLength ids={{ from: `${lang}-period-from`, to: `${lang}-period-to` }} />
    </>
  );
}

function FilesDemo({ d, w }) {
  const [files, setFiles] = useState([]);
  // A simulated upload: progress in steps, then a reference; a file named
  // "fail…" is refused, as a Chest refusing it would.
  const upload = (file, { onProgress, signal }) => new Promise((resolve, reject) => {
    let p = 0;
    const timer = setInterval(() => {
      p += 0.1 + Math.random() * 0.15;
      onProgress(Math.min(1, p));
      if (p >= 1) {
        clearInterval(timer);
        resolve(file.name.startsWith("fail") ? { ok: false, error: w.files.failed } : { ok: true, ref: "obj_" + file.name });
      }
    }, 250);
    signal.addEventListener("abort", () => { clearInterval(timer); reject(new DOMException("aborted", "AbortError")); });
  });
  // A form that edits a claim: its photo stored before (storedFile), the
  // camera beside the files on a phone (on a desk, the one button: the
  // camera's input is not there at all), previews one can recognise.
  const [photos, setPhotos] = useState(() => [storedFile({ ref: "obj_bumper", name: "bumper.jpg", size: 182_000, type: "image/jpeg" })]);
  return (
    <div className="demo-grid">
      <FilePicker label={d.receipts} files={files} onChange={setFiles} upload={upload} maxFiles={4} maxSize={10 * 1024 * 1024} accept={["image/*", ".pdf"]} capture="environment" labels={w.files} />
      <FilePicker label={d.photos} files={photos} onChange={setPhotos} upload={upload} maxFiles={3} maxSize={10 * 1024 * 1024} accept={["image/*"]} camera showLabel previewSize="m" name="photos"
        preview={() => <span className="demo-thumb" aria-hidden="true" />} labels={w.files} />
    </div>
  );
}

function TableDemo({ d, w, lang }) {
  const [params, setParams] = useState("");
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  // Several states at once: ?state=sent,late.
  const states = (new URLSearchParams(params).get("state") ?? "").split(",").filter(Boolean);
  const shown = quotes.filter(r => (states.length === 0 || states.includes(r.state)) && (!q || matches(r.client, q) || r.id.toLowerCase().includes(q.toLowerCase())));
  const link = ({ href, children, ...rest }) => <a href={href} {...rest} onClick={e => { e.preventDefault(); setParams(href.split("?")[1] ?? ""); }}>{children}</a>;
  const count = s => quotes.filter(r => r.state === s).length;
  const columns = [
    { key: "id", label: "#", value: r => r.id, rowHeader: true, width: "narrow" },
    { key: "client", label: d.client, value: r => r.client },
    { key: "issued", label: d.issued, value: r => -r.issued, render: r => fill(r.issued === 0 ? w.date.today : lang === "fr" ? "il y a {n} j" : "{n} d ago", { n: r.issued }), hideOnPhone: true },
    { key: "state", label: d.state, value: r => r.state, render: r => <StatusBadge tone={tone[r.state]} label={d.states[r.state]} size="s" /> },
    { key: "amount", label: d.amount, value: r => r.amount, align: "end", render: r => money(r.amount, lang) },
  ];
  return (
    <div className="demo-stack">
      <div className="demo-toolbar">
        <Filters path="/chest/quotes" params={params} link={link} labels={w.filters} phone="scroll" groups={[{ key: "state", label: d.filterState, multiple: true, options: ["draft", "sent", "paid", "late"].map(s => ({ value: s, label: d.states[s], count: count(s) })) }]} />
        <Filters path="/chest/quotes" params={cat ? `cat=${cat}` : ""} labels={w.filters} onNavigate={href => setCat(new URLSearchParams(href.split("?")[1] ?? "").get("cat") ?? "")} groups={[{ key: "cat", label: d.category, as: "select", options: d.categories.map((c, i) => ({ value: `c${i}`, label: c })) }]} />
        <SearchBox action="/chest/quotes" onSearch={setQ} labels={w.search} />
      </div>
      <BandFilters d={d} w={w} />
      <DataTable caption={d.quotes} columns={columns} rows={shown} rowKey={r => r.id} rowName={r => `${r.id} ${r.client}`} labels={w.table} phone="stack" rowHref={r => `#${r.id}`}
        actions={() => [{ label: d.duplicate, onSelect: () => {} }, { label: d.download, onSelect: () => {} }, { label: d.delete, tone: "danger", onSelect: () => {} }]}
        totals={{ amount: money(shown.reduce((s, r) => s + r.amount, 0), lang) }}
        empty={<EmptyState title={d.noQuotes} body={d.noQuotesBody} headingLevel={3} labels={w.shell} />} />
    </div>
  );
}

// Filters kept in the page (0.2.3): no address, the list is the page's
// state; a select's sections (optgroups) and its own "every" words, a
// chip group's "Anyone"; on a band of the orange slot, the filters' words
// take the band's measured pair (--cat-3-ink on --cat-3-soft).
function BandFilters({ d, w }) {
  const [value, setValue] = useState({});
  const kinds = ["laptop", "screen", "dock", "licence", "chair"];
  const items = d.items.map((name, i) => ({ name, kind: kinds[i], owner: i % 2 ? "mbr_tom" : "mbr_lea" }));
  const shown = items.filter(it => (!value.kind || it.kind === value.kind) && (!value.owner || it.owner === value.owner));
  return (
    <div className="demo-cat-band">
      <Filters value={value} onChange={setValue} labels={w.filters} groups={[
        { key: "kind", label: d.itemKind, as: "select", allLabel: d.everyCategory, options: items.map(it => ({ value: it.kind, label: it.name, ...(it.kind === "chair" ? {} : { group: it.kind === "licence" ? d.software : d.hardware }) })) },
        { key: "owner", label: d.owner2, all: true, allLabel: d.anyone, options: [{ value: "mbr_lea", label: "Léa Moreau" }, { value: "mbr_tom", label: "Tom Petit" }] },
      ]} />
      <p className="demo-band-count" role="status">{fill(d.shown, { n: shown.length })}: {shown.map(it => it.name).join(", ")}</p>
    </div>
  );
}

function BitsDemo({ d, w, lang }) {
  const [tab, setTab] = useState("up");
  const [view, setView] = useState("board");
  const [part, setPart] = useState("day");
  const [notify, setNotify] = useState(true);
  const faces = team.slice(0, 6);
  // The widest initials: every stack size must keep them whole.
  const wide = [{ id: "mbr_mw", name: "Marc Weber" }, { id: "mbr_wm", name: "Wanda Moulin" }, { id: "mbr_mm", name: "Maëlle Mercier" }, ...team.slice(0, 3)];
  return (
    <div className="demo-stack">
      <EmptyState title={d.emptyTitle} body={d.emptyBody} action={<button type="button" className="ck-button">{d.addRoom}</button>} example={{ onClick: () => {} }} labels={w.shell} headingLevel={3} />
      <div className="demo-row">
        <Avatar name="Camille Martin" size="xl" />
        <Avatar name="Inès Haddad" size="l" />
        <Avatar name="Hugo Bernard" />
        <Avatar name="Léa Moreau" size="s" />
        <AvatarStack people={faces} max={4} labels={w.shell} lang={lang} />
        <AvatarStack people={faces.slice(0, 2)} size="s" labels={w.shell} lang={lang} />
      </div>
      <div className="demo-row demo-stacks">
        {["s", "m", "l", "xl"].map(size => <AvatarStack key={size} people={wide} max={4} size={size} labels={w.shell} lang={lang} />)}
      </div>
      <div className="demo-row">
        {["draft", "sent", "paid", "late"].map(s => <StatusBadge key={s} tone={tone[s]} label={d.states[s]} />)}
        <StatusBadge category={1} label={lang === "fr" ? "Congés" : "Holiday"} />
        <StatusBadge category={3} label={lang === "fr" ? "Formation" : "Training"} />
        <StatusBadge category={5} label={lang === "fr" ? "Maladie" : "Sick"} />
        <StatusBadge category={1} label={d.laptop} icon={<svg className="ck-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="4" y="5" width="16" height="11" rx="1" /><path d="M2 19h20" /></svg>} />
        <StatusBadge label={d.noOwner} empty />
      </div>
      <Switch label={d.notify} hint={d.notifyHint} checked={notify} onChange={setNotify} />
      <Checkbox label={d.billable} hint={d.billableHint} name="billable" defaultChecked />
      {/* A band of its own colour (--inverse) with the tool's signal on it
          (--inverse-signal, 0.2.3): the current tab's rule and a Start
          button, read in every look and mode. */}
      <div className="demo-band" role="group" aria-label={d.panel}>
        <nav aria-label={d.timer} className="demo-band-nav"><a href="#timer" aria-current="page" onClick={e => e.preventDefault()}>{d.timer}</a><a href="#running" onClick={e => e.preventDefault()}>{d.running}</a></nav>
        <span className="demo-band-clock">00:42:10</span>
        <button type="button" className="demo-band-start">{d.startTimer}</button>
      </div>
      <Tabs label={d.booking} current={tab} onChange={setTab} items={[{ id: "up", label: d.upcoming, count: 3 }, { id: "past", label: d.past }, { id: "cancel", label: d.cancelled, count: 1 }]}>
        <div className="demo-row">
          <Segmented label={d.view} value={view} onChange={setView} options={[{ value: "board", label: d.board }, { value: "list", label: d.list }]} />
          <Segmented label={d.when} value={part} onChange={setPart} options={[{ value: "am", label: d.morning }, { value: "pm", label: d.afternoon, disabled: true }, { value: "day", label: d.allDay }]} />
          <Segmented label={d.layout} value="board" onChange={() => {}} disabled options={[{ value: "board", label: d.board }, { value: "list", label: d.list }]} />
          <Segmented label={d.view} value={view} link={({ href, children, ...rest }) => <a href={href} {...rest} onClick={e => { e.preventDefault(); setView(href.slice(6)); }}>{children}</a>} options={[{ value: "board", label: d.board, href: "?view=board" }, { value: "list", label: d.list, href: "?view=list" }]} />
          <Menu label={d.booking} showLabel items={[{ label: d.duplicate, onSelect: () => {} }, { label: d.delete, tone: "danger", onSelect: () => {} }]} />
          <Menu label={d.export} showLabel size="m" align="start" items={[{ id: "csv", label: d.exportCsv, note: d.exportNote, href: "data:text/csv,a", download: "quotes.csv" }, { id: "open", label: d.openBoard, href: "#board", }]} />
          <Menu label={d.assignTo} showLabel align="start" items={[{ id: "mbr_lea1", label: d.sameName, note: d.sameNameNote, onSelect: () => {} }, { id: "mbr_lea2", label: d.sameName, note: d.sameNameNote2, onSelect: () => {} }]} />
        </div>
      </Tabs>
    </div>
  );
}

function ShellDemo({ d, w, lang }) {
  const [path, setPath] = useState("/chest/boards/7");
  const link = ({ href, children, ...rest }) => <a href={href} {...rest} onClick={e => { e.preventDefault(); setPath(href); }}>{children}</a>;
  const icon = p => <svg className="ck-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{p}</svg>;
  return (
    <div className="demo-stack">
      <div className="demo-frame">
        <AppShell brand={<a href="/chest" onClick={e => { e.preventDefault(); setPath("/chest"); }}><span className="demo-mark" aria-hidden="true" />Tasks</a>} path={path} link={link} labels={w.shell}
          member={{ name: "Camille Martin", role: d.manager, photo: null }}
          nav={[
            { href: "/chest", label: d.home, icon: icon(<path d="M4 11l8-7 8 7v9H4z" />) },
            { href: "/chest/mine", label: d.myTasks, count: 4, icon: icon(<path d="M5 12l4 4 10-10" />) },
            { href: "/chest/boards", label: d.boards, icon: icon(<><rect x="4" y="4" width="7" height="16" rx="1" /><rect x="13" y="4" width="7" height="10" rx="1" /></>) },
            // A long single word (0.2.3): never broken inside on a phone.
            { href: "/chest/companies", label: d.companies, count: 12, icon: icon(<><rect x="4" y="8" width="16" height="12" rx="1" /><path d="M9 8V4h6v4" /></>) },
            { href: "/chest/settings", label: d.settings, icon: icon(<><circle cx="12" cy="12" r="3" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3" /></>) },
          ]}>
          <PageHeader title={d.myTasks} intro={d.tasksIntro} action={<button type="button" className="ck-button">{d.newTask}</button>} />
        </AppShell>
      </div>
      <div className="demo-row">
        <span className="ck-label">{d.language}</span>
        <LanguageSwitch languages={storeLanguages} current={lang} label={d.language} link={({ children, ...rest }) => <a {...rest} onClick={e => e.preventDefault()}>{children}</a>} />
      </div>
      <h3 className="demo-sub">{d.noAccess}</h3>
      <NoAccess labels={w.shell} />
    </div>
  );
}

// The whole workbench, in one language.
export function Workbench({ lang, today }) {
  const d = demoWords[lang];
  const w = lang === "fr" ? fr : en;
  return (
    <Toasts labels={w.toast}>
      <div className="bench" lang={lang}>
        <Section id={`${lang}-toast`} title={d.toast} intro={d.toastIntro}><ToastDemo d={d} lang={lang} /></Section>
        <Section id={`${lang}-dialog`} title={d.dialog} intro={d.dialogIntro}><DialogDemo d={d} w={w} lang={lang} today={today} /></Section>
        <Section id={`${lang}-people`} title={d.people} intro={d.peopleIntro}><PeopleDemo d={d} w={w} lang={lang} /></Section>
        <Section id={`${lang}-dates`} title={d.dates} intro={d.datesIntro}><DatesDemo d={d} w={w} today={today} lang={lang} /></Section>
        <Section id={`${lang}-files`} title={d.files} intro={d.filesIntro}><FilesDemo d={d} w={w} /></Section>
        <Section id={`${lang}-table`} title={d.table} intro={d.tableIntro}><TableDemo d={d} w={w} lang={lang} /></Section>
        <Section id={`${lang}-bits`} title={d.bits}><BitsDemo d={d} w={w} lang={lang} /></Section>
        <Section id={`${lang}-shell`} title={d.shell} intro={d.shellIntro}><ShellDemo d={d} w={w} lang={lang} /></Section>
      </div>
    </Toasts>
  );
}

// A small specimen for the side-by-side matrix: the pieces whose look the
// theme changes most, static (a toast shown in place).
export function Specimen({ lang, today }) {
  const d = demoWords[lang];
  const w = lang === "fr" ? fr : en;
  return (
    <div className="spec-k" lang={lang}>
      <PageHeader headingLevel={2} title={d.quotes} action={<button type="button" className="ck-button ck-button-small" tabIndex={-1}>{d.newTask}</button>} />
      <div className="demo-row">
        <StatusBadge tone="ok" label={d.states.paid} size="s" />
        <StatusBadge tone="wait" label={lang === "fr" ? "En attente" : "Waiting"} size="s" />
        <StatusBadge tone="danger" label={d.states.late} size="s" />
        <StatusBadge category={4} label={lang === "fr" ? "Projet" : "Project"} size="s" />
        <AvatarStack people={team.slice(0, 5)} size="s" max={3} labels={w.shell} lang={lang} />
      </div>
      <nav className="ck-tabs" aria-hidden="true"><ul><li><span className="ck-tab" aria-current="page">{d.upcoming}<span className="ck-count">3</span></span></li><li><span className="ck-tab">{d.past}</span></li></ul></nav>
      <div className="demo-row" aria-hidden="true">
        <span className="ck-filter-chip" aria-current="true">{d.states.sent}<span className="ck-count">2</span></span>
        <span className="ck-filter-chip">{d.states.paid}<span className="ck-count">1</span></span>
        <span className="ck-chip-button" aria-pressed="true">{w.date.today}</span>
      </div>
      <div className="ck-toast spec-toast" aria-hidden="true"><p className="ck-toast-text">{d.noteDeleted}</p><span className="ck-toast-undo">{w.toast.undo}</span></div>
      <div className="ck-field spec-field" aria-hidden="true">{addDays(today, 1).split("-").reverse().join("/")}</div>
    </div>
  );
}
