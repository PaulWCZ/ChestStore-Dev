// Safe in the browser: no SDK here, types only.
// What the document page hands its client components: plain data, words
// already written where the server writes them (dates, names).
import type { Line, State } from "./documents.ts";
import type { Locale } from "./i18n/index.ts";
import type { DocumentType, Status, VatTreatment } from "./model.ts";
import type { Buyer, Seller } from "./parties.ts";
import type { RateTotal } from "./totals.ts";

export type ClientOption = Buyer & { id: string; language: Locale; reverseCharge: boolean; archived: boolean; countryName: string };
export type ItemOption = { id: string; name: string; description: string; unit: string; unitPrice: number; vatRate: number; goods: boolean };

export type DocView = {
  id: string;
  type: DocumentType;
  status: Status;
  state: State;
  number: string | null;
  kindText: string;
  clientId: string | null;
  title: string;
  language: Locale;
  currency: string;
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
};

export type Fact = { label: string; value: string; strong?: boolean };
export type Moment = { text: string; when: string };
export type PaymentView = { id: string; date: string; amount: string; method: string; note: string };
export type RelatedView = { id: string; text: string; amount: string; state: string };
export type Message = { to: string; subject: string; text: string; upcoming?: string };

export type Rights = { edit: boolean; quote: boolean; draftInvoice: boolean; issue: boolean; pay: boolean; settings: boolean };
