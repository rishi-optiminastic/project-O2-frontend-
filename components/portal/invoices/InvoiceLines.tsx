"use client";

import { inputClass } from "@/components/portal/ui";
import { formatINR } from "@/lib/utils";
import { NUMBER_RULES, TEXT_MAX } from "@/lib/validation";
import type { InvoiceLine, InvoiceLineInput, Project } from "@/lib/api";

/** First two digits of our GSTIN (Maharashtra). A client GSTIN from any other state means IGST. */
export const HOME_STATE_CODE = "27";

/** IGST when the client's GSTIN is from another state; null when it has no usable GSTIN and the user decides. */
export function interstateFromGstin(gstin: string | null | undefined): boolean | null {
  const state = gstin?.slice(0, 2) ?? "";
  if (!/^[0-9]{2}$/.test(state)) return null;
  return state !== HOME_STATE_CODE;
}

/** What is typed for one service: the amount (before GST) and an optional description. */
export type LineDraft = { amount: string; description: string };
export type LineDrafts = Record<number, LineDraft>;

/** Drafts for a project's services, filled from an invoice's existing lines when editing. */
export function draftsFor(project: Project | undefined, lines?: InvoiceLine[]): LineDrafts {
  const drafts: LineDrafts = {};
  for (const s of project?.services ?? []) {
    const line = lines?.find((l) => l.service_id === s.id);
    drafts[s.id] = { amount: line ? String(line.taxable_value) : "", description: line?.description ?? "" };
  }
  return drafts;
}

/** The lines to send: every service with an amount, in the project's order. */
export function lineInputs(project: Project | undefined, drafts: LineDrafts): InvoiceLineInput[] {
  return (project?.services ?? [])
    .filter((s) => Number(drafts[s.id]?.amount) > 0)
    .map((s) => ({
      service_id: s.id,
      taxable_value: Number(drafts[s.id].amount),
      description: drafts[s.id].description.trim() || null,
    }));
}

/** One row per project service: amount and description. Leave an amount empty to skip that service. */
export function LinesEditor({
  project,
  drafts,
  onChange,
}: {
  project: Project;
  drafts: LineDrafts;
  onChange: (drafts: LineDrafts) => void;
}) {
  function set(serviceId: number, key: keyof LineDraft, value: string) {
    const current = drafts[serviceId] ?? { amount: "", description: "" };
    onChange({ ...drafts, [serviceId]: { ...current, [key]: value } });
  }

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-xs tracking-eyebrow text-secondary">
        {project.services.length > 1
          ? "Amount per service, GST is added on top (leave empty to skip a service)"
          : "Amount, GST is added on top"}
      </legend>
      <div className="flex flex-col divide-y divide-line/60 rounded-2xl border border-line">
        {project.services.map((s) => (
          <div key={s.id} className="flex flex-col gap-2 p-3">
            <p className="text-sm font-medium">
              {s.title}
              <span className="ml-2 font-mono text-xs font-normal text-ink-40">SAC {s.sac_code ?? "-"}</span>
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_10rem]">
              <input
                aria-label={`${s.title} description printed on the invoice`}
                maxLength={TEXT_MAX}
                value={drafts[s.id]?.description ?? ""}
                onChange={(e) => set(s.id, "description", e.target.value)}
                placeholder="Description (optional; the service title is printed when empty)"
                className={inputClass}
              />
              <input
                aria-label={`${s.title} amount in rupees, GST is added on top`}
                {...NUMBER_RULES.money}
                required={project.services.length === 1}
                value={drafts[s.id]?.amount ?? ""}
                onChange={(e) => set(s.id, "amount", e.target.value)}
                placeholder="₹ Amount"
                className={`${inputClass} tabular-nums`}
              />
            </div>
          </div>
        ))}
      </div>
    </fieldset>
  );
}

/** Live totals for the lines, with the CGST + SGST or IGST split. */
export function LinesPreview({ project, drafts, interstate }: { project: Project; drafts: LineDrafts; interstate: boolean }) {
  const lines = lineInputs(project, drafts);
  const rates = new Map(project.services.map((s) => [s.id, s.gst_rate]));
  const taxable = lines.reduce((sum, l) => sum + l.taxable_value, 0);
  const gst = lines.reduce((sum, l) => sum + Math.round(l.taxable_value * (rates.get(l.service_id) ?? 0)) / 100, 0);
  const total = taxable + gst;
  const rateLabels = [...new Set(lines.map((l) => rates.get(l.service_id) ?? 0))];
  const rate = rateLabels.length === 1 ? rateLabels[0] : null;
  const splitLabel = interstate ? `IGST${rate !== null ? ` ${rate}%` : ""}` : `CGST + SGST${rate !== null ? ` ${rate / 2}% each` : ""}`;

  return (
    <div className="grid grid-cols-2 gap-3 rounded-2xl border border-line bg-mist/50 p-4 text-center text-sm sm:grid-cols-4">
      <div>
        <p className="text-xs text-ink-40">Taxable</p>
        <p className="mt-1 font-medium tabular-nums">{formatINR(taxable)}</p>
      </div>
      <div>
        <p className="text-xs text-ink-40">{splitLabel}</p>
        <p className="mt-1 font-medium tabular-nums">{interstate ? formatINR(gst) : `${formatINR(gst / 2)} × 2`}</p>
      </div>
      <div>
        <p className="text-xs text-ink-40">GST total</p>
        <p className="mt-1 font-medium tabular-nums">{formatINR(gst)}</p>
      </div>
      <div>
        <p className="text-xs text-ink-40">Invoice total</p>
        <p className="mt-1 font-medium tabular-nums">{formatINR(total)}</p>
      </div>
    </div>
  );
}

/** The IGST tick box: decided by the client's GSTIN when it has one, otherwise the user's choice. */
export function InterstateField({
  clientGstin,
  checked,
  onChange,
}: {
  clientGstin: string | null | undefined;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  const auto = interstateFromGstin(clientGstin);
  return (
    <label className="flex items-center gap-2 text-sm font-light text-secondary">
      <input
        type="checkbox"
        checked={auto ?? checked}
        disabled={auto !== null}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-foreground"
      />
      IGST (inter-state)
      <span className="text-xs text-ink-40">
        {auto === null
          ? "· client has no GSTIN, so tick it if they are outside Maharashtra"
          : `· set from the client's GSTIN (state ${clientGstin?.slice(0, 2)})`}
      </span>
    </label>
  );
}

/** The services billed on an invoice, read-only. */
export function LinesTable({ lines }: { lines: InvoiceLine[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-line">
      <table className="w-full min-w-[480px] text-left text-sm">
        <thead>
          <tr className="border-b border-line text-xs tracking-eyebrow text-ink-40">
            <th className="px-4 py-3 font-medium">Service</th>
            <th className="w-28 px-4 py-3 font-medium">SAC</th>
            <th className="w-36 px-4 py-3 text-right font-medium">Taxable</th>
            <th className="w-36 px-4 py-3 text-right font-medium">GST</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={`${l.service_id}-${i}`} className="border-b border-line/60 last:border-0">
              <td className="px-4 py-3">
                <span className="font-medium">{l.service_title}</span>
                {l.description && l.description !== l.service_title && (
                  <span className="block text-xs text-ink-40">{l.description}</span>
                )}
              </td>
              <td className="px-4 py-3 font-mono text-xs text-secondary">{l.sac_code ?? "-"}</td>
              <td className="px-4 py-3 text-right tabular-nums">{formatINR(l.taxable_value)}</td>
              <td className="px-4 py-3 text-right tabular-nums">
                {formatINR(l.gst_amount)}
                <span className="block text-xs text-ink-40">{l.gst_rate}%</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
