// Safe in the browser: no SDK here, types only.
// What the document page hands its client components: plain data, words
// already written where the server writes them (dates, names).
import type { Line, State } from "./documents.ts";
import type { Catalogue, Locale } from "../i18n/index.ts";
import type { DocumentType, Status, VatTreatment } from "../shared/model.ts";
import type { Buyer, Seller } from "../shared/parties.ts";
import type { RateTotal } from "../shared/totals.ts";

export type ClientOption = Buyer & { id: string; language: Locale; reverseCharge: boolean; archived: boolean; countryName: string };
export type ItemOption = { id: string; name: string; description: string; unit: string; unitPrice: number; vatRate: number; goods: boolean };

export type DocView = {
  id: string;
  type: DocumentType;
  status: Status;
  state: State;
  // A quote's number with its version after the first ("D-2026-0007 v2").
  number: string | null;
  version: number;
  kindText: string;
  clientId: string | null;
  title: string;
  language: Locale;
  currency: string;
  // Outside the euro: the exchange rate (units for one euro, millionths).
  eurRate: number | null;
  issueDate: string | null;
  deliveryDate: string | null;
  validUntil: string | null;
  dueDate: string | null;
  paymentDays: number;
  vatTreatment: VatTreatment;
  franchise: boolean;
  notes: string;
  depositPercent: number | null;
  lines: Line[];
  net: number;
  vat: number;
  gross: number;
  rates: RateTotal[];
  paid: number;
  credited: number;
  due: number;
  seller: Seller;
  buyer: (Buyer & { countryName: string }) | null;
  readyAt: string | null;
  sentAt: string | null;
  emailedTo: string | null;
  reminders: number;
  reference: { id: string; number: string; date: string } | null;
  crmTitle: string | null;
  // Its structured copy: an issued invoice or credit note is a Factur-X.
  facturx: boolean;
  // This invoice repeats (every period, the next draft's day, written), or
  // this draft was made by the repeat of an invoice (its number).
  repeat: { id: string; every: "month" | "quarter" | "year"; next: string } | null;
  madeFrom: { id: string; number: string } | null;
  // Imported from the previous tool (its own number, no PDF here).
  imported: boolean;
  // Made from time handed over by Timesheets: its project, the client's
  // name Timesheets gave, the link back (null when not reachable).
  // `counted`: what Timesheets counted, said when this invoice counts
  // otherwise (null when they agree).
  timesheets: { project: string; client: string; link: string | null; counted: string | null } | null;
};

export type Fact = { label: string; value: string; strong?: boolean };
export type Moment = { text: string; when: string };
export type PaymentView = { id: string; date: string; amount: string; method: string; note: string };
export type RelatedView = { id: string; text: string; amount: string; state: string };
export type Message = { to: string; subject: string; text: string; upcoming?: string };

export type Rights = { edit: boolean; quote: boolean; draftInvoice: boolean; issue: boolean; pay: boolean; settings: boolean };

// The quote's online answer, as the margin shows it: the link that works
// now (null when none; its address null when the public address is not
// known), and the answers given, each with its proof written out.
export type AnswerView = { id: string; accepted: boolean; title: string; when: string; reason: string; proof: Fact[]; pdf: string | null };
export type OnlineView = { url: string | null; live: boolean; until: string; answers: AnswerView[] };

// An earlier version of a quote, as the margin lists it (its PDF's address,
// null when it could not be kept).
export type VersionView = { version: number; text: string; pdf: string | null };

// What the document's island says: the sections of the catalogue its
// paper, margin and dialogs use (never the whole catalogue: a page's props
// travel in its HTML).
export type DocWords = Pick<Catalogue, "doc" | "states" | "errors" | "shell" | "list" | "common" | "methods" | "editor" | "picker" | "clientForm" | "send" | "finalise" | "fromQuote" | "payment" | "repeatDialog" | "kit"> & { settings: { fields: Catalogue["settings"]["fields"] } };
