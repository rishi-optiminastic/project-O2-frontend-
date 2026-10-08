"use client";

import type { KeyboardEvent, ReactNode } from "react";
import { motion } from "framer-motion";
import { ArrowUp, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { stagger } from "@/lib/motion";
import { DottedSparkline } from "@/components/charts/DottedSparkline";

const rowReveal = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const } },
};

/** Monochrome status pill — tone derived from semantic state, but stays grayscale. */
export function StatusPill({ status }: { status: string }) {
  const s = status.toLowerCase();
  let dot = "bg-secondary";
  if (/(paid|approved|reconcil|verified|matched|completed|released|ready|sent to client)/.test(s))
    dot = "bg-foreground";
  else if (/(reject|mismatch|overdue|cancel|dispute)/.test(s)) dot = "bg-ink-40";
  else if (/(pending|draft|submitted|review|partial|progress|not started|due)/.test(s)) dot = "bg-silver";

  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-line bg-white/60 px-3 py-1 text-xs font-medium text-foreground/80">
      <span className={cn("h-1.5 w-1.5 rounded-full", dot)} />
      {status}
    </span>
  );
}

export function PageHeading({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="font-sans text-4xl font-bold leading-[0.95] tracking-[-0.04em] md:text-5xl">{title}</h1>
        {description && <p className="mt-2 text-sm font-light text-secondary">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-[28px] border border-line card-surface p-6", className)}>{children}</div>
  );
}

export function KpiTile({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-[28px] border border-line card-surface p-6">
      <div className="flex items-start justify-between">
        <span className="text-xs tracking-eyebrow text-secondary">{label}</span>
        {icon && <span className="text-ink-40">{icon}</span>}
      </div>
      <p className="mt-5 text-3xl font-extralight tracking-tight tabular-nums">{value}</p>
      {sub && <p className="mt-1 text-xs text-ink-40">{sub}</p>}
    </div>
  );
}

/** Tiny vertical-bar sparkline for KPI cards. */
export function MiniBars({ data, peak }: { data: number[]; peak?: number }) {
  const max = Math.max(1, ...data);
  const peakIdx = peak ?? data.indexOf(Math.max(...data));
  return (
    <div className="flex h-12 items-end gap-[3px]">
      {data.map((v, i) => (
        <span
          key={i}
          style={{ height: `${Math.max(8, (v / max) * 100)}%` }}
          className={cn("w-[3px] rounded-full", i === peakIdx ? "bg-foreground" : "bg-foreground/20")}
        />
      ))}
    </div>
  );
}

/** Shared dashboard card radius / surface — one radius for every card. */
export const CARD = "rounded-[28px] border border-line card-surface";

/** Reference-style metric card: label · big value · dotted chart · footer. */
export function MetricCard({
  label,
  value,
  unit,
  delta,
  sub,
  spark,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  delta?: string;
  sub?: string;
  /** Optional trend series. Pass only real data for this metric - never a placeholder series. */
  spark?: number[];
}) {
  return (
    <div className={cn(CARD, "flex flex-col p-6")}>
      <p className="text-[11px] tracking-eyebrow text-secondary">{label}</p>
      <p className="mt-3 text-3xl font-light tracking-tight tabular-nums">
        {value}
        {unit && <span className="ml-1.5 align-baseline text-xs font-normal text-ink-40">{unit}</span>}
      </p>
      {spark ? (
        <div className="mt-5 flex-1">
          <DottedSparkline data={spark} rows={5} dot={4} gap={3} />
        </div>
      ) : (
        <div className="flex-1" />
      )}
      {(delta || sub) && (
        <div className="mt-5 flex items-center gap-2 border-t border-line pt-4 text-xs text-secondary">
          {delta ? (
            <>
              <span className="flex h-4 w-4 items-center justify-center rounded-full border border-foreground/30">
                <ArrowUp className="h-2.5 w-2.5" strokeWidth={2} />
              </span>
              {delta}
            </>
          ) : (
            sub
          )}
        </div>
      )}
    </div>
  );
}

/** Simple, elegant data table. */
export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-[28px] border border-line card-surface">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-b border-line">
            {head.map((h) => (
              <th key={h} className="whitespace-nowrap px-5 py-4 text-xs font-medium tracking-eyebrow text-ink-40">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <motion.tbody
          variants={stagger(0.05)}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.05 }}
        >
          {children}
        </motion.tbody>
      </table>
    </div>
  );
}

export function Row({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  // Clickable rows must also be reachable and operable from the keyboard.
  const onKeyDown = onClick
    ? (e: KeyboardEvent<HTMLTableRowElement>) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }
    : undefined;

  return (
    <motion.tr
      variants={rowReveal}
      onClick={onClick}
      onKeyDown={onKeyDown}
      tabIndex={onClick ? 0 : undefined}
      className={cn(
        "border-b border-line/60 transition-colors last:border-0",
        onClick &&
          "cursor-pointer outline-none hover:bg-mist/50 focus-visible:bg-mist/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-foreground/20",
      )}
    >
      {children}
    </motion.tr>
  );
}

export function Cell({ children, className }: { children: ReactNode; className?: string }) {
  return <td className={cn("whitespace-nowrap px-5 py-4 font-light", className)}>{children}</td>;
}

export function Empty({
  message,
  icon,
  action,
}: {
  message: string;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-[28px] border border-dashed border-line py-16 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-mist text-ink-40">
        {icon ?? <Inbox className="h-5 w-5" strokeWidth={1.6} />}
      </span>
      <p className="max-w-xs text-sm font-light text-secondary">{message}</p>
      {action}
    </div>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs tracking-eyebrow text-secondary">{label}</span>
      {children}
    </label>
  );
}

export const inputClass =
  "h-11 w-full rounded-xl border border-line bg-background px-3.5 text-sm outline-none transition-colors placeholder:text-ink-40 focus:border-foreground/40";

/** Read-only labelled value used on detail / profile pages. */
export function DataField({
  label,
  value,
  mono,
  className,
}: {
  label: string;
  value?: ReactNode;
  mono?: boolean;
  className?: string;
}) {
  const empty = value === null || value === undefined || value === "";
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <span className="text-[11px] tracking-eyebrow text-secondary">{label}</span>
      <span
        className={cn(
          "text-sm font-light text-foreground",
          mono && "tabular-nums",
          empty && "text-ink-40",
        )}
      >
        {empty ? "—" : value}
      </span>
    </div>
  );
}
