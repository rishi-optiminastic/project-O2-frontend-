"use client";

import { Panel } from "@/components/portal/ui";
import { useApi } from "@/lib/useApi";
import type { InvoiceTimelineEntry } from "@/lib/api";
import { formatDate } from "@/lib/utils";

/** Who did what to this invoice, oldest first. Remount (change `key`) to refresh. */
export function InvoiceTimeline({ invoiceId }: { invoiceId: number }) {
  const { data, loading } = useApi<InvoiceTimelineEntry[]>(`/invoices/${invoiceId}/timeline`);

  return (
    <Panel>
      <h2 className="mb-5 text-sm font-medium tracking-eyebrow text-secondary">History</h2>
      {loading && !data ? (
        <p className="text-sm text-ink-40">Loading history…</p>
      ) : !data || data.length === 0 ? (
        <p className="text-sm text-ink-40">No history recorded yet.</p>
      ) : (
        <ol className="flex flex-col gap-4">
          {data.map((entry) => (
            <li key={entry.id} className="flex gap-3 text-sm">
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-foreground/60" aria-hidden />
              <div className="min-w-0">
                <p>
                  <span className="font-medium">{entry.action}</span>
                  {entry.actor_name && <span className="text-secondary"> · {entry.actor_name}</span>}
                </p>
                {entry.detail && <p className="whitespace-pre-line text-secondary">{entry.detail}</p>}
                <p className="text-xs text-ink-40">{formatDate(entry.created_at)}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}
