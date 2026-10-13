"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowUpRight, MoreHorizontal } from "lucide-react";
import { PortalShell } from "@/components/portal/PortalShell";
import { MetricCard, Panel, StatusPill, Table, Row, Cell, Empty } from "@/components/portal/ui";
import { PixelBarChart } from "@/components/charts/PixelBarChart";
import { AnimatedNumber } from "@/components/portal/AnimatedNumber";
import { useApi } from "@/lib/useApi";
import { useAuth } from "@/lib/auth";
import { formatINR } from "@/lib/utils";
import { fadeUp, stagger } from "@/lib/motion";
import type { DashboardSummary, CashflowPoint } from "@/lib/api";
import { MonthFilter } from "@/components/portal/MonthFilter";
import { useMonth, withMonth } from "@/lib/month";

const item = fadeUp;

const RANGES = ["Weekly", "Monthly", "Yearly"] as const;
type Range = (typeof RANGES)[number];

export default function DashboardPage() {
  const { user, hasRole } = useAuth();
  const canApprovals = hasRole("ADMIN_CEO", "CFO", "FINANCE_MANAGER");
  const [month] = useMonth();
  const { data, loading } = useApi<DashboardSummary>(withMonth("/dashboard/summary", month));
  const [range, setRange] = useState<Range>("Monthly");

  // Real received-revenue series for the selected range (buckets actual payments).
  const { data: revenue } = useApi<CashflowPoint[]>(`/dashboard/revenue?range=${range.toLowerCase()}`);

  // Role-specific approval widget: the CEO sees what awaits their sign-off,
  // the Manager sees what awaits a payment reference ID.
  const queue = data?.approvals_queue ?? [];
  const approvalView =
    user?.role === "ADMIN_CEO"
      ? {
          title: "Pending your approval",
          items: queue.filter((a) => a.status === "Submitted for CEO Approval"),
          empty: "No requests awaiting your approval.",
        }
      : user?.role === "FINANCE_MANAGER"
        ? {
            title: "Pending payment reference",
            items: queue.filter((a) => a.status === "Payment Ready"),
            empty: "No payments awaiting a reference ID.",
          }
        : { title: "Payment approvals", items: queue, empty: "Nothing pending." };

  const series = useMemo(() => revenue ?? [], [revenue]);
  const totalRevenue = useMemo(() => series.reduce((s, d) => s + d.value, 0), [series]);

  return (
    <PortalShell>
      <motion.div
        className="flex flex-col gap-8"
        initial="hidden"
        animate="show"
        variants={stagger(0.1, 0.05)}
      >
        <motion.h1
          variants={item}
          className="font-sans text-4xl font-bold leading-[0.95] tracking-[-0.04em] md:text-5xl"
        >
          Welcome back,{" "}
          <span className="bg-gradient-to-r from-[#3f6fd6] via-[#7f8fd0] to-[#e0a92e] bg-clip-text text-transparent">
            {user?.name.split(" ")[0]}
          </span>
        </motion.h1>

        <motion.div variants={item}>
          <MonthFilter />
        </motion.div>

        {/* Metric cards */}
        <motion.div variants={item} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="NET RECEIVABLE"
            tone="info"
            value={loading ? "—" : <AnimatedNumber value={data?.net_receivable ?? 0} format={formatINR} />}
            sub={`Across ${data?.total_invoices ?? 0} invoice${data?.total_invoices === 1 ? "" : "s"}`}
          />
          <MetricCard
            label="NET PAYABLE"
            tone={data?.net_payable ? "warning" : "success"}
            value={loading ? "—" : <AnimatedNumber value={data?.net_payable ?? 0} format={formatINR} />}
            sub={`Across ${data?.total_vendors ?? 0} vendor${data?.total_vendors === 1 ? "" : "s"}`}
          />
          <MetricCard
            label="PENDING APPROVALS"
            tone={data?.pending_approvals ? "warning" : "success"}
            value={loading ? "—" : <AnimatedNumber value={data?.pending_approvals ?? 0} />}
            sub="Awaiting CEO sign-off"
          />
          <MetricCard
            label="GST TO PAY"
            tone={data?.gst_payable ? "danger" : "success"}
            value={loading ? "—" : <AnimatedNumber value={data?.gst_payable ?? 0} format={formatINR} />}
            sub="Sales GST less input credit"
          />
        </motion.div>

        {/* Revenue trend — pixel chart */}
        <motion.div variants={item}>
        <Panel className="!p-7">
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-medium tracking-eyebrow text-secondary">REVENUE TREND</h2>
            </div>
            <button className="flex h-7 w-7 items-center justify-center rounded-full border border-line text-ink-40 hover:text-foreground">
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </div>

          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-6">
              <p className="text-2xl font-light tracking-tight tabular-nums">
                <span className="text-sm text-ink-40">Total · </span>
                {formatINR(totalRevenue)}
              </p>
              <span className="hidden items-center gap-1.5 text-xs text-secondary sm:flex">
                <span className="h-2 w-2 rounded-full bg-foreground" /> Revenue
              </span>
            </div>

            {/* Range toggle */}
            <div className="flex items-center gap-1 rounded-full border border-line bg-white/50 p-1">
              {RANGES.map((r) => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  className={
                    "rounded-full px-4 py-1.5 text-xs font-medium transition-colors " +
                    (range === r ? "bg-foreground text-background" : "text-secondary hover:text-foreground")
                  }
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {totalRevenue > 0 ? (
            <PixelBarChart
              data={series}
              newRatio={0}
              labels={{ primary: "Received", secondary: "Pending" }}
              dotted
            />
          ) : (
            <div className="flex h-56 flex-col items-center justify-center gap-2 text-center">
              <p className="text-sm font-light text-secondary">No revenue recorded for this period yet.</p>
              <p className="text-xs text-ink-40">Record a receipt from a client and it will appear here.</p>
            </div>
          )}

          {totalRevenue > 0 && series.length > 1 && (
            <div className="mt-5 flex items-center justify-between border-t border-line pt-4 text-xs text-secondary">
              <span className="tabular-nums">
                {series[0].label} · {formatINR(series[0].value)}
              </span>
              <span className="tabular-nums">
                {series[series.length - 1].label} · {formatINR(series[series.length - 1].value)}
              </span>
            </div>
          )}
        </Panel>
        </motion.div>

        {/* Approvals + recent invoices */}
        <motion.div
          className={canApprovals ? "grid gap-6 lg:grid-cols-[1fr_1.4fr]" : "grid gap-6"}
          variants={item}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.2 }}
        >
          {canApprovals && (
            <Panel>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-light tracking-tight">{approvalView.title}</h2>
                <Link href="/portal/approvals" className="text-xs text-secondary hover:text-foreground">
                  View all →
                </Link>
              </div>
              <div className="flex flex-col gap-3">
                {!approvalView.items.length && <p className="text-sm text-ink-40">{approvalView.empty}</p>}
                {approvalView.items.map((a) => (
                  <Link
                    key={a.id}
                    href="/portal/approvals"
                    className="flex items-center justify-between rounded-2xl border border-line bg-white/50 px-4 py-3 transition-colors hover:bg-mist/50"
                  >
                    <div>
                      <p className="text-sm font-medium">{a.payee_name}</p>
                      <p className="text-xs text-ink-40">{formatINR(a.net_payable)}</p>
                    </div>
                    <StatusPill status={a.status} />
                  </Link>
                ))}
              </div>
            </Panel>
          )}

          <div>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-light tracking-tight">Recent invoices</h2>
              <Link href="/portal/invoices" className="flex items-center gap-1 text-xs text-secondary hover:text-foreground">
                All invoices <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>
            {data && data.recent_invoices.length > 0 ? (
              <Table head={["Invoice", "Total", "Pending", "Status", "Lock"]}>
                {data.recent_invoices.map((i) => (
                  <Row key={i.id}>
                    <Cell className="font-medium">{i.invoice_number}</Cell>
                    <Cell>{formatINR(i.total_amount)}</Cell>
                    <Cell>{formatINR(i.amount_pending)}</Cell>
                    <Cell>
                      <StatusPill status={i.status} />
                    </Cell>
                    <Cell className="text-ink-40">{i.is_locked ? "🔒 Locked" : "Open"}</Cell>
                  </Row>
                ))}
              </Table>
            ) : (
              <Empty message={loading ? "Loading…" : "No invoices yet."} />
            )}
          </div>
        </motion.div>
      </motion.div>
    </PortalShell>
  );
}
