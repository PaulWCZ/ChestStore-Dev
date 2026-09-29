"use client";

import { AppShell, Menu, type MenuItem } from "@argentic/chest-ui/components";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Box, Coins, Desk, Download, Gear, Invoice, People, Quote, Upload } from "./icons.tsx";

// The members' frame: the kit's AppShell (skip link, header, labelled
// sections — a row of their own under the header on a phone, never icons
// alone, never hidden —, the member chip), with Next.js's Link and the
// current path. The five places of every day are sections; the rare ones
// (the accountant's export, the settings) wait in a "More" menu at the
// right of the header. Functions and icons are made here, in a client
// component: the server layout passes only plain data.
export type ShellWords = { desk: string; quotes: string; invoices: string; clients: string; catalogue: string; more: string; export: string; settings: string; bank: string; importInvoices: string };

export function Shell({ brand, member, words, sections, overdue, canExport, canBank, canImportInvoices, labels, children }: {
  brand: ReactNode;
  member: { name: string; role: string | null; photo: string | null };
  words: ShellWords;
  // false: a role that gives nothing (no sections, no menu).
  sections: boolean;
  // Overdue invoices: a true count, on the Invoices tab.
  overdue: number;
  canExport: boolean;
  // Matching a bank statement (who records payments); importing the
  // invoices still to collect (who issues them) — switching day's.
  canBank: boolean;
  canImportInvoices: boolean;
  labels: { skip: string; nav: string };
  children: ReactNode;
}) {
  const path = usePathname();
  const nav = sections ? [
    { href: "/chest", label: words.desk, icon: <Desk />, match: "exact" as const },
    { href: "/chest/quotes", label: words.quotes, icon: <Quote /> },
    { href: "/chest/invoices", label: words.invoices, icon: <Invoice />, ...(overdue > 0 ? { count: overdue } : {}) },
    { href: "/chest/clients", label: words.clients, icon: <People /> },
    { href: "/chest/catalogue", label: words.catalogue, icon: <Box /> },
  ] : [];
  const more: MenuItem[] = [
    ...(canBank ? [{ label: words.bank, href: "/chest/bank", icon: <Coins /> }] : []),
    ...(canExport ? [{ label: words.export, href: "/chest/export", icon: <Download /> }] : []),
    ...(canImportInvoices ? [{ label: words.importInvoices, href: "/chest/import?kind=invoices", icon: <Upload /> }] : []),
    { label: words.settings, href: "/chest/settings", icon: <Gear /> },
  ];
  return (
    <AppShell
      brand={brand}
      nav={nav}
      path={path}
      link={Link}
      member={member}
      tools={sections ? <Menu label={words.more} items={more} showLabel /> : null}
      labels={labels}
      width="full"
    >
      {children}
    </AppShell>
  );
}
