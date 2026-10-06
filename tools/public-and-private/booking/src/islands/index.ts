import { CopyButton } from "../components/copy-button.tsx";
import { ToastHost } from "@argentic/chest-app/client";
import { AgendaTools, FreeToggle } from "./AgendaTools.tsx";
import { BookTime, MoveMine } from "./BookTime.tsx";
import { CancelMeeting } from "./CancelMeeting.tsx";
import { CancelMine } from "./CancelMine.tsx";
import { Exceptions } from "./Exceptions.tsx";
import { FirstRun } from "./FirstRun.tsx";
import { ForGuest } from "./ForGuest.tsx";
import { MoveMeeting, PaidSwitch } from "./MoveMeeting.tsx";
import { OtherCalendars } from "./OtherCalendars.tsx";
import { CompanySettings, EmbedSettings, ImportCalendly, PageSettings } from "./SettingsForms.tsx";
import { TypeForm } from "./TypeForm.tsx";
import { TypeSwitch } from "./TypeSwitch.tsx";
import { WeekEditor } from "./WeekEditor.tsx";

// The components that also run in the browser (islands), by name. A page
// renders one with <Island name="TypeForm" props={{…}} />; everything else
// is HTML from the server, with no script. Islands do not nest (a
// component an island uses — the time picker, the copy button — is just a
// component inside it).
export const islands = {
  ToastHost, CopyButton,
  // The team's part.
  FirstRun, AgendaTools, FreeToggle, CancelMeeting, MoveMeeting, PaidSwitch, ForGuest,
  TypeSwitch, TypeForm, WeekEditor, OtherCalendars, Exceptions,
  PageSettings, ImportCalendly, CompanySettings, EmbedSettings,
  // The public part.
  BookTime, MoveMine, CancelMine,
};
