"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Panel, DataField, Badge } from "@/components/portal/ui";
import { Button } from "@/components/ui/Button";
import { useApi } from "@/lib/useApi";
import { api, ApiError, type Client, type GstLookupResult, type Invoice } from "@/lib/api";

/**
 * A client's GST details: the company name and address registered against
 * their GSTIN, and which of their tax invoices still await an e-invoice.
 */
export function ClientGstPanel({ client }: { client: Client }) {
  const router = useRouter();
  // Every invoice, not just this month's: a pending e-invoice from last month still matters.
  const { data: invoices } = useApi<Invoice[]>(`/invoices?client_id=${client.id}`);
  const [lookup, setLookup] = useState<GstLookupResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pending = (invoices ?? []).filter((i) => i.is_issued && i.einvoice_status === "E-invoice Pending");

  async function check() {
    if (!client.gst_number) return;
    setChecking(true);
    setError(null);
    try {
      setLookup(await api.lookupGst(client.gst_number));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "GST lookup failed");
    } finally {
      setChecking(false);
    }
  }

  const live = lookup?.source === "appyflow";
  const nameFromGst = live ? lookup.legal_name ?? lookup.trade_name : null;
  const addressFromGst = live ? lookup.address : null;

  return (
    <Panel>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-medium tracking-eyebrow text-secondary">Client / company GST details</h2>
        {client.gst_number && (
          <Button size="sm" variant="secondary" magnetic={false} onClick={check} disabled={checking}>
            <RefreshCw className={checking ? "h-4 w-4 animate-spin" : "h-4 w-4"} /> {checking ? "Checking…" : "Fetch from GST"}
          </Button>
        )}
      </div>

      {!client.gst_number ? (
        <p className="text-sm text-secondary">No GSTIN on record. Add it with Edit to fetch the registered name and address.</p>
      ) : (
        <div className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
          <DataField label="GSTIN" value={client.gst_number} mono />
          <DataField label="State" value={lookup?.state ?? null} />
          <DataField label="GST registration status" value={lookup?.status ?? null} />
          <DataField
            label="Company name from GST"
            value={nameFromGst ?? (lookup ? "Not available (GST lookup key not set)" : client.legal_name ?? "Press Fetch from GST")}
          />
          <DataField
            label="Address from GST"
            value={addressFromGst ?? (lookup ? "Not available (GST lookup key not set)" : client.billing_address ?? "Press Fetch from GST")}
            className="sm:col-span-2"
          />
          {lookup?.message && <p className="col-span-full text-xs text-ink-40">{lookup.message}</p>}
        </div>
      )}
      {error && <p role="alert" className="mt-3 text-sm text-danger">⚠ {error}</p>}

      <div className="mt-6 border-t border-line/60 pt-5">
        <div className="flex items-center gap-3">
          <p className="text-sm font-medium">Generate e-invoice: pending</p>
          <Badge tone={pending.length ? "warning" : "success"}>{invoices ? pending.length : "…"}</Badge>
        </div>
        {pending.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {pending.map((i) => (
              <button
                key={i.id}
                onClick={() => router.push(`/portal/invoices/${i.id}`)}
                className="rounded-full border border-line bg-mist px-3 py-1 text-xs text-secondary transition-colors hover:text-foreground"
              >
                {i.display_number}
              </button>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-xs text-ink-40">Every issued tax invoice for this client has its e-invoice recorded.</p>
        )}
      </div>
    </Panel>
  );
}
