import { ToastHost } from "@argentic/chest-app/client";
import { createElement, type ComponentType } from "react";
import { useLive } from "../components/keys.ts";
import { AutoRefresh } from "./AutoRefresh.tsx";
import { Composer } from "./Composer.tsx";
import { ContactForm } from "./ContactForm.tsx";
import { CopyLink } from "./CopyLink.tsx";
import { EmbedBox } from "./EmbedBox.tsx";
import { EraseBox } from "./EraseBox.tsx";
import { FolderSelect } from "./FolderSelect.tsx";
import { FormattedBody } from "./FormattedBody.tsx";
import { FormBox } from "./FormBox.tsx";
import { HoursBox } from "./HoursBox.tsx";
import { InboxList } from "./InboxList.tsx";
import { InboxTools } from "./InboxTools.tsx";
import { Keys } from "./Keys.tsx";
import { MineReply } from "./MineReply.tsx";
import { NewTicket } from "./NewTicket.tsx";
import { NoticesBox } from "./NoticesBox.tsx";
import { PeriodTabs } from "./PeriodTabs.tsx";
import { Rate } from "./Rate.tsx";
import { RepliesBox } from "./RepliesBox.tsx";
import { ReportTable } from "./ReportTable.tsx";
import { RulesBox } from "./RulesBox.tsx";
import { TagsBox } from "./TagsBox.tsx";
import { TicketSide } from "./TicketSide.tsx";
import { WriteAgain } from "./WriteAgain.tsx";

// The components that also run in the browser (islands), by name. A page
// renders one with <Island name="InboxList" props={{…}} />; everything
// else is HTML from the server, with no script. Islands do not nest.
// Each counts itself once alive (useLive: the keyboard shortcuts wait for
// the whole page) — a wrapper without HTML of its own, on the server too.
function live<P extends object>(Component: ComponentType<P>): ComponentType<P> {
  const Live = (props: P) => {
    useLive();
    return createElement(Component, props);
  };
  Live.displayName = Component.displayName ?? Component.name;
  return Live;
}
function allLive<T extends Record<string, ComponentType<never>>>(list: T): T {
  return Object.fromEntries(Object.entries(list).map(([name, c]) => [name, live(c as ComponentType<object>)])) as unknown as T;
}

export const islands = allLive({
  ToastHost, AutoRefresh, Keys, FolderSelect,
  InboxTools, InboxList, Composer, TicketSide, FormattedBody, NewTicket, MineReply, Rate,
  PeriodTabs, ReportTable,
  FormBox, HoursBox, RulesBox, NoticesBox, EmbedBox, TagsBox, RepliesBox, EraseBox,
  ContactForm, WriteAgain, CopyLink,
});
