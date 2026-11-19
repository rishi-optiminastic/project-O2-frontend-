"use client";

import { useEffect, useState } from "react";
import {
  AlarmClock,
  BadgeIndianRupee,
  ExternalLink,
  FileText,
  FolderKanban,
  Landmark,
  Loader2,
  MessageSquarePlus,
  Percent,
  ReceiptText,
  ShieldCheck,
  SquareSlash,
  Sunrise,
  Truck,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { api, type Approval, type AssistantCommand, type Client, type Invoice, type Project, type Vendor, type VendorInvoice } from "@/lib/api";
import { cn, formatINR } from "@/lib/utils";

export interface SlashRecord {
  id: number;
  title: string;
  subtitle: string;
  href: string;
  /** The text put in the message when the user picks "Ask", so the agent knows exactly which record. */
  mention: string;
}

/** Where a record command loads from and how each row is shown, opened and mentioned. */
interface RecordSource {
  path: string;
  /** True when the API filters with ?search=; otherwise the list is filtered here. */
  searchable: boolean;
  toRecord: (row: never) => SlashRecord;
}

/** A command that lists records ("/clients lok") or one that drops a ready question into the box ("/overdue"). */
export type Command =
  | { type: "record"; name: string; hint: string; icon: LucideIcon; source: RecordSource }
  | { type: "prompt"; name: string; hint: string; icon: LucideIcon; prompt: string; saved?: boolean };

function source<T>(path: string, searchable: boolean, toRecord: (row: T) => SlashRecord): RecordSource {
  return { path, searchable, toRecord: toRecord as (row: never) => SlashRecord };
}

export const SLASH_COMMANDS: Command[] = [
  {
    type: "record", name: "clients", hint: "Open or ask about a client", icon: Users,
    source: source<Client>("/clients", true, (c) => ({
      id: c.id, title: c.business_name, subtitle: c.email, href: `/portal/clients/${c.id}`,
      mention: `client "${c.business_name}" (client id ${c.id})`,
    })),
  },
  {
    type: "record", name: "vendors", hint: "Open or ask about a vendor", icon: Truck,
    source: source<Vendor>("/vendors", true, (v) => ({
      id: v.id, title: v.business_name, subtitle: v.is_verified ? "Verified vendor" : "Vendor",
      href: `/portal/vendors/${v.id}`, mention: `vendor "${v.business_name}" (vendor id ${v.id})`,
    })),
  },
  {
    type: "record", name: "invoices", hint: "Open or ask about a client invoice", icon: FileText,
    source: source<Invoice>("/invoices", true, (i) => ({
      id: i.id, title: i.display_number, subtitle: `${formatINR(i.total_amount)} · ${i.status}`,
      href: `/portal/invoices/${i.id}`, mention: `client invoice ${i.display_number} (invoice id ${i.id})`,
    })),
  },
  {
    type: "record", name: "bills", hint: "Open or ask about a vendor bill", icon: ReceiptText,
    source: source<VendorInvoice>("/vendors/invoices/all", false, (b) => ({
      id: b.id, title: b.invoice_number, subtitle: `${formatINR(b.amount_payable)} payable · ${b.status}`,
      href: `/portal/vendors/${b.vendor_id}`, mention: `vendor bill ${b.invoice_number} (vendor invoice id ${b.id})`,
    })),
  },
  {
    type: "record", name: "projects", hint: "Open or ask about a project", icon: FolderKanban,
    source: source<Project>("/projects", false, (p) => ({
      id: p.id, title: `${p.code} · ${p.title}`, subtitle: [p.client_name, p.status].filter(Boolean).join(" · "),
      href: `/portal/projects/${p.id}`, mention: `project ${p.code} "${p.title}" (project id ${p.id})`,
    })),
  },
  {
    type: "record", name: "approvals", hint: "Open or ask about a payment request", icon: ShieldCheck,
    source: source<Approval>("/approvals", false, (a) => ({
      id: a.id, title: a.payee_name, subtitle: `${formatINR(a.amount)} · ${a.status}`,
      href: "/portal/approvals", mention: `payment request to ${a.payee_name} (approval id ${a.id})`,
    })),
  },
  {
    type: "prompt", name: "summary", hint: "Today's finance summary", icon: Sunrise,
    prompt: "Give me today's finance summary: money to collect, bills to pay, payment requests waiting and anything overdue.",
  },
  {
    type: "prompt", name: "overdue", hint: "Client invoices past their due date", icon: AlarmClock,
    prompt: "Which client invoices are overdue? List each with the client, amount due and days late.",
  },
  {
    type: "prompt", name: "payables", hint: "What we owe vendors", icon: Wallet,
    prompt: "What do we owe vendors right now? List unpaid bills by vendor with the amount payable.",
  },
  {
    type: "prompt", name: "pending", hint: "Payment requests waiting for me", icon: ShieldCheck,
    prompt: "Which payment requests are waiting for my approval?",
  },
  {
    type: "prompt", name: "cash", hint: "Money in and out this month", icon: Landmark,
    prompt: "How much have we received from clients and paid to vendors this month?",
  },
  {
    type: "prompt", name: "gst", hint: "GST collected and paid this month", icon: Percent,
    prompt: "Summarise GST collected on our invoices and GST paid on vendor bills this month.",
  },
  {
    type: "prompt", name: "tds", hint: "TDS deducted this month", icon: BadgeIndianRupee,
    prompt: "How much TDS have we deducted from vendor bills this month, by section?",
  },
];

const MAX_ROWS = 8;
const SEARCH_DELAY_MS = 200;

/** One entry in the open menu: either a command to choose, or a record from the chosen command. */
export type SlashItem = { type: "command"; command: Command } | { type: "record"; record: SlashRecord };

/**
 * Reads the "/" command the user is typing at the end of the message.
 * "/cl" is a command still being typed; "/clients lok" is a chosen command with a search.
 */
export function parseSlash(text: string): { start: number; command: string; query: string | null } | null {
  const match = /(^|\s)\/([a-z]*)(?: ([^\n/]*))?$/i.exec(text);
  if (!match) return null;
  return { start: match.index + match[1].length, command: match[2].toLowerCase(), query: match[3] ?? null };
}

/** The record command a typed word refers to, singular or plural ("/client" works as well as "/clients"). */
export function recordCommandFor(word: string) {
  return SLASH_COMMANDS.find(
    (c): c is Extract<Command, { type: "record" }> => c.type === "record" && (c.name === word || c.name === `${word}s`),
  );
}

/** The CEO's saved commands as menu entries (they drop their prompt into the box). */
export function savedCommands(saved: AssistantCommand[]): Command[] {
  return saved.map((c) => ({
    type: "prompt", name: c.name, hint: c.description || c.prompt, icon: SquareSlash, prompt: c.prompt, saved: true,
  }));
}

/** Commands whose name starts with what was typed: record pickers, quick asks, then saved commands. */
export function matchingCommands(typed: string, saved: Command[] = []): Command[] {
  return [...SLASH_COMMANDS, ...saved].filter((c) => c.name.startsWith(typed));
}

function matches(record: SlashRecord, search: string): boolean {
  const needle = search.toLowerCase();
  return `${record.title} ${record.subtitle}`.toLowerCase().includes(needle);
}

/** Loads the records for a chosen command, searching as the user types (debounced). */
export function useSlashRecords(command: Extract<Command, { type: "record" }> | undefined, query: string) {
  const [state, setState] = useState<{ key: string; records: SlashRecord[] } | null>(null);
  const search = query.trim();
  const key = command ? `${command.name}:${search}` : "";

  useEffect(() => {
    if (!command) return;
    const { path, searchable, toRecord } = command.source;
    let live = true;
    const timer = setTimeout(() => {
      const url = searchable && search ? `${path}?search=${encodeURIComponent(search)}` : path;
      api
        .get<never[]>(url)
        .catch(() => [] as never[])
        .then((rows) => {
          if (!live) return;
          const records = rows.map(toRecord).filter((r) => searchable || !search || matches(r, search));
          setState({ key, records: records.slice(0, MAX_ROWS) });
        });
    }, SEARCH_DELAY_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [command, search, key]);

  const ready = state?.key === key;
  return { records: ready ? state.records : [], loading: Boolean(command) && !ready };
}

interface Props {
  items: SlashItem[];
  active: number;
  loading: boolean;
  emptyText: string;
  onHover: (index: number) => void;
  onChoose: (item: SlashItem) => void;
  onOpen: (record: SlashRecord) => void;
}

const GROUP_TITLE = { record: "Find a record", prompt: "Quick asks", saved: "Your commands" } as const;

function groupOf(command: Command): keyof typeof GROUP_TITLE {
  return command.type === "prompt" && command.saved ? "saved" : command.type;
}

/** The menu shown above the composer while a "/" command is being typed. */
export function SlashMenu({ items, active, loading, emptyText, onHover, onChoose, onOpen }: Props) {
  const showingRecords = items.some((item) => item.type === "record");
  return (
    <div
      role="listbox"
      aria-label="Commands"
      className="popover-surface absolute inset-x-0 bottom-full z-20 mb-2 max-h-96 overflow-y-auto rounded-2xl p-2 shadow-[0_30px_60px_-30px_rgba(17,17,17,0.35)]"
    >
      {loading && (
        <p className="flex items-center gap-2 px-3 py-3 text-sm text-ink-40">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </p>
      )}
      {!loading && items.length === 0 && <p className="px-3 py-3 text-sm text-ink-40">{emptyText}</p>}
      {!loading &&
        items.map((item, i) => {
          const selected = i === active;
          const rowClass = cn(
            "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors",
            selected ? "bg-foreground/[0.06]" : "hover:bg-foreground/[0.04]",
          );
          if (item.type === "command") {
            const { icon: Icon, name, hint } = item.command;
            const group = groupOf(item.command);
            const previous = items[i - 1];
            const newGroup = !previous || (previous.type === "command" && groupOf(previous.command) !== group);
            return (
              <div key={`${group}-${name}`}>
                {newGroup && (
                  <p className="px-3 pb-1 pt-2 text-[10px] font-medium tracking-eyebrow text-ink-40">{GROUP_TITLE[group]}</p>
                )}
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onMouseEnter={() => onHover(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onChoose(item)}
                  className={rowClass}
                >
                  <Icon className="h-4 w-4 shrink-0 text-secondary" aria-hidden />
                  <span className="text-sm font-medium">/{name}</span>
                  <span className="truncate text-xs text-ink-40">{hint}</span>
                </button>
              </div>
            );
          }
          const { record } = item;
          return (
            <div
              key={record.id}
              role="option"
              aria-selected={selected}
              onMouseEnter={() => onHover(i)}
              className={rowClass}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{record.title}</span>
                <span className="block truncate text-xs text-ink-40">{record.subtitle}</span>
              </span>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onChoose(item)}
                className="inline-flex h-7 items-center gap-1 rounded-lg border border-line px-2 text-xs text-secondary hover:border-foreground/30 hover:text-foreground"
              >
                <MessageSquarePlus className="h-3.5 w-3.5" aria-hidden /> Ask
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onOpen(record)}
                className="inline-flex h-7 items-center gap-1 rounded-lg border border-line px-2 text-xs text-secondary hover:border-foreground/30 hover:text-foreground"
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden /> Open
              </button>
            </div>
          );
        })}
      <p className="mt-1 border-t border-line/60 px-3 pt-2 text-[10px] text-ink-40">
        {showingRecords
          ? "↑↓ to move · Enter to ask about it · Ctrl+Enter to open it · Esc to close"
          : "↑↓ to move · Enter to choose · Esc to close"}
      </p>
    </div>
  );
}
