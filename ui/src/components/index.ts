"use client";

// @argentic/chest-ui/components — the store's shared React components.
// Client components (hooks, events); a server component may render them
// with plain-data props. Styled only by contract tokens: import the
// stylesheet once, in the root layout:
//
//   import "@argentic/chest-ui/components.css";
//
// Pure helpers and the default words live in
// @argentic/chest-ui/components/logic (server-safe, no "use client").
// Named exports only: Next.js refuses `export *` in a client boundary.
export { Toasts, useToast, useDismissToast, type ShowToast } from "./toast.js";
export { Dialog, Confirm, type DialogProps, type ConfirmProps } from "./dialog.js";
export { PeoplePicker, type PeoplePickerProps } from "./people-picker.js";
export { Avatar, AvatarStack, type AvatarSize, type Face } from "./avatar.js";
export { DateField, Calendar, type DateFieldProps } from "./date-field.js";
export { DayStrip, type DayStripProps } from "./day-strip.js";
export { TimeSelect, type TimeSelectProps } from "./time-select.js";
export { FilePicker, filesReady, type FilePickerProps, type PickedFile, type Upload } from "./file-picker.js";
export { DataTable, type Column, type DataTableProps } from "./data-table.js";
export { Menu, type MenuItem } from "./menu.js";
export { Filters, SearchBox, type FilterGroup, type FilterOption, type FiltersProps, type SearchBoxProps } from "./filters.js";
export { EmptyState, StatusBadge, Tabs, Segmented, type TabItem, type Tone } from "./bits.js";
export { AppShell, AutoRefresh, BrandMark, LanguageSwitch, MemberChip, Nav, NavLink, NoAccess, PageHeader, useAutoRefresh, type AppShellProps, type LinkComponent, type NavItem } from "./shell.js";
