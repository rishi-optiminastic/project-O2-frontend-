"use client";

import { useState } from "react";
import { PortalShell } from "@/components/portal/PortalShell";
import { PageHeading, MetricCard, Table, Row, Cell, Empty, Field, inputClass } from "@/components/portal/ui";
import { Select } from "@/components/portal/Select";
import { Tabs } from "@/components/portal/Tabs";
import { useApi } from "@/lib/useApi";
import type { Client, Project, Vendor } from "@/lib/api";
import type { ProfitabilityData, ProfitFigures } from "@/lib/finance";
import { formatINR } from "@/lib/utils";

const ALL = "all";
type Level = "projects" | "clients" | "vendors";

const pct = (v: number | null) => (v == null ? "-" : `${v}%`);

/**
 * Profitability and cash at company, project, client and vendor level.
 * Invoiced, collected, approved and paid are shown side by side, never merged.
 */
export default function ProfitabilityPage() {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [project, setProject] = useState(ALL);
  const [client, setClient] = useState(ALL);
  const [vendor, setVendor] = useState(ALL);
  const [level, setLevel] = useState<Level>("projects");
  const { data: projects } = useApi<Project[]>("/projects");
  const { data: clients } = useApi<Client[]>("/clients");
  const { data: vendors } = useApi<Vendor[]>("/vendors");

  const q = new URLSearchParams();
  if (dateFrom) q.set("date_from", dateFrom);
  if (dateTo) q.set("date_to", dateTo);
  if (project !== ALL) q.set("project_id", project);
  if (client !== ALL) q.set("client_id", client);
  if (vendor !== ALL) q.set("vendor_id", vendor);
  const { data, loading, error } = useApi<ProfitabilityData>(`/profitability?${q}`);
  const c = data?.company;

  return (
    <PortalShell>
      <div className="flex flex-col gap-8">
        <PageHeading
          title="Profitability"
          description="Gross profit = revenue − direct costs. Invoiced, collected, approved and paid figures are kept separate: an unpaid invoice is not cash, and an approved bill is not a payment."
        />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="From"><input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={inputClass} /></Field>
          <Field label="To"><input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={inputClass} /></Field>
          <Field label="Project">
            <Select value={project} onValueChange={setProject}
              options={[{ value: ALL, label: "All projects" }, ...(projects ?? []).map((p) => ({ value: String(p.id), label: `${p.code} · ${p.title}` }))]} />
          </Field>
          <Field label="Client">
            <Select value={client} onValueChange={setClient}
              options={[{ value: ALL, label: "All clients" }, ...(clients ?? []).map((x) => ({ value: String(x.id), label: x.business_name }))]} />
          </Field>
          <Field label="Vendor">
            <Select value={vendor} onValueChange={setVendor}
              options={[{ value: ALL, label: "All vendors" }, ...(vendors ?? []).map((v) => ({ value: String(v.id), label: v.business_name }))]} />
          </Field>
        </div>
        {error && <Empty message={`Could not load profitability: ${error}`} />}

        {c && (
          <>
            <Section title="Revenue">
              <MetricCard label="Agreed (contracts)" value={formatINR(c.agreed_revenue)} sub="Contract values incl. amendments" />
              <MetricCard label="Invoiced" value={formatINR(c.invoiced_revenue)} sub="Issued tax invoices, before GST" />
              <MetricCard label="Collected" value={formatINR(c.collected_revenue)} sub="Settled by clients (cash + TDS), before GST" />
              <MetricCard label="Outstanding receivables" value={formatINR(c.outstanding_receivables)} tone={c.outstanding_receivables ? "warning" : undefined} sub="Still due from clients, incl. GST" />
            </Section>
            <Section title="Expenses">
              <MetricCard label="Vendor invoices" value={formatINR(c.vendor_invoiced)} sub={`${formatINR(c.vendor_approved)} approved in review`} />
              <MetricCard label="Vendor payments released" value={formatINR(c.vendor_paid)} sub="Actually paid out" />
              <MetricCard label="Other direct expenses" value={formatINR(c.other_expenses)} sub={`${formatINR(c.other_expenses_paid)} paid`} />
              <MetricCard label="Outstanding payables" value={formatINR(c.outstanding_payables)} tone={c.outstanding_payables ? "warning" : undefined} sub="Approved bills not yet paid" />
            </Section>
            <Section title="Profitability">
              <MetricCard label="Estimated profit" value={formatINR(c.estimated_profit)} sub={`${pct(c.estimated_margin_pct)} of agreed revenue`} />
              <MetricCard label="Actual profit" value={formatINR(c.actual_profit)} tone={c.actual_profit < 0 ? "danger" : "success"} sub="Invoiced revenue − direct costs" />
              <MetricCard label="Gross margin" value={pct(c.gross_margin_pct)} sub="Actual profit ÷ invoiced revenue" />
              <MetricCard label="Budget vs actual" value={formatINR(c.budget_vs_actual)} tone={c.budget_vs_actual < 0 ? "danger" : undefined} sub={`Budget ${formatINR(c.budget)}`} />
            </Section>
            <Section title="Cash flow">
              <MetricCard label="Money in" value={formatINR(c.cash_in)} sub="Client receipts (cash)" />
              <MetricCard label="Money out" value={formatINR(c.cash_out)} sub="Released payouts and paid expenses" />
              <MetricCard label="Net cash flow" value={formatINR(c.net_cash_flow)} tone={c.net_cash_flow < 0 ? "danger" : "success"} />
              <MetricCard label="Receivables − payables" value={formatINR(c.outstanding_receivables - c.outstanding_payables)} sub="What is still to come in, less what is still to go out" />
            </Section>
          </>
        )}

        <div className="flex flex-col gap-4">
          <Tabs tabs={[
            { key: "projects", label: "By project", badge: data?.projects.length },
            { key: "clients", label: "By client", badge: data?.clients.length },
            { key: "vendors", label: "By vendor", badge: data?.vendors.length },
          ]} active={level} onChange={setLevel} layoutId="profit-level" label="Breakdown" />
          {data ? <Breakdown level={level} data={data} /> : <Empty message={loading ? "Loading…" : "No data."} />}
        </div>
      </div>
    </PortalShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium tracking-eyebrow text-secondary">{title}</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{children}</div>
    </section>
  );
}

function Breakdown({ level, data }: { level: Level; data: ProfitabilityData }) {
  const rows: (ProfitFigures & { name: string; sub?: string | null })[] =
    level === "projects" ? data.projects.map((p) => ({ ...p, name: `${p.code} · ${p.title}`, sub: p.client_name }))
      : level === "clients" ? data.clients.map((x) => ({ ...x, name: x.client_name ?? "Client" }))
        : data.vendors.map((v) => ({ ...v, name: v.vendor_name ?? "Vendor" }));
  if (!rows.length) return <Empty message="Nothing in these filters." />;
  const vendorView = level === "vendors";
  return (
    <Table head={vendorView
      ? ["Vendor", "Share of agreed revenue", "Committed cost", "Invoiced to us", "Paid", "Payables", "Margin on share"]
      : ["Name", "Agreed", "Invoiced", "Collected", "Direct costs", "Paid out", "Actual profit", "Margin"]}>
      {rows.map((r) => (
        <Row key={r.name}>
          <Cell className="max-w-xs whitespace-normal font-medium">{r.name}{r.sub && <span className="block text-xs font-light text-ink-40">{r.sub}</span>}</Cell>
          {vendorView ? (
            <>
              <Cell className="tabular-nums">{formatINR(r.agreed_revenue)}</Cell>
              <Cell className="tabular-nums">{formatINR(r.committed_vendor_cost)}</Cell>
              <Cell className="tabular-nums">{formatINR(r.vendor_invoiced)}</Cell>
              <Cell className="tabular-nums">{formatINR(r.vendor_paid)}</Cell>
              <Cell className="tabular-nums">{formatINR(r.outstanding_payables)}</Cell>
              <Cell className="tabular-nums">{formatINR(r.agreed_revenue - r.vendor_invoiced)}</Cell>
            </>
          ) : (
            <>
              <Cell className="tabular-nums">{formatINR(r.agreed_revenue)}</Cell>
              <Cell className="tabular-nums">{formatINR(r.invoiced_revenue)}</Cell>
              <Cell className="tabular-nums">{formatINR(r.collected_revenue)}</Cell>
              <Cell className="tabular-nums">{formatINR(r.direct_costs)}</Cell>
              <Cell className="tabular-nums">{formatINR(r.cash_out)}</Cell>
              <Cell className={"tabular-nums " + (r.actual_profit < 0 ? "text-danger" : "")}>{formatINR(r.actual_profit)}</Cell>
              <Cell className="tabular-nums">{pct(r.gross_margin_pct)}</Cell>
            </>
          )}
        </Row>
      ))}
    </Table>
  );
}
