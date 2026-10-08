"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { PortalShell } from "@/components/portal/PortalShell";
import { PageHeading, Panel, Table, Row, Cell, Empty, StatusPill, Field, inputClass } from "@/components/portal/ui";
import { Button } from "@/components/ui/Button";
import { useApi } from "@/lib/useApi";
import { api, ApiError, type BankStatement, type BankStatementDetail } from "@/lib/api";
import { formatINR, formatDate } from "@/lib/utils";
import { MonthFilter } from "@/components/portal/MonthFilter";
import { useMonth, withMonth } from "@/lib/month";

export default function VerificationPage() {
  const [month] = useMonth();
  const { data, loading, refetch } = useApi<BankStatement[]>(withMonth("/verification/statements", month));
  const [active, setActive] = useState<BankStatementDetail | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    const fd = new FormData(e.currentTarget);
    setUploading(true);
    setError(null);
    try {
      const detail = await api.uploadStatement(file, String(fd.get("bank_name") || ""), String(fd.get("account_number") || ""));
      setActive(detail);
      (e.target as HTMLFormElement).reset();
      refetch();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function openDetail(id: number) {
    setActive(await api.get<BankStatementDetail>(`/verification/statements/${id}`));
  }

  return (
    <PortalShell>
      <div className="flex flex-col gap-8">
        <PageHeading
          title="Verification"
          description="Upload bank statements and auto-match transactions to system records."
          action={<MonthFilter />}
        />

        <Panel>
          <h2 className="mb-4 text-lg font-light tracking-tight">Upload statement</h2>
          <form onSubmit={onUpload} className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Bank name">
              <input name="bank_name" className={inputClass} placeholder="HDFC Bank" />
            </Field>
            <Field label="Account number">
              <input name="account_number" className={inputClass} />
            </Field>
            <Field label="File (CSV / Excel / PDF)">
              <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,.pdf" required className={inputClass + " py-1.5 text-secondary file:mr-3 file:h-8 file:cursor-pointer file:rounded-full file:border-0 file:bg-foreground file:px-4 file:text-xs file:font-medium file:text-background"} />
            </Field>
            {error && <p className="sm:col-span-3 text-sm text-foreground/80">⚠ {error}</p>}
            <div className="sm:col-span-3 flex justify-end">
              <Button size="sm" type="submit" magnetic={false} disabled={uploading}>
                <Upload className="h-4 w-4" /> {uploading ? "Matching…" : "Upload & auto-match"}
              </Button>
            </div>
          </form>
          <p className="mt-3 text-xs text-ink-40">
            CSV columns are matched flexibly (date, amount, UTR/reference, narration). PDFs are stored for manual review.
          </p>
        </Panel>

        <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
          {/* Statements list */}
          <div>
            <h2 className="mb-4 text-lg font-light tracking-tight">Statements</h2>
            {data && data.length > 0 ? (
              <div className="flex flex-col gap-2">
                {data.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => openDetail(s.id)}
                    className="flex items-center justify-between rounded-2xl border border-line bg-white/50 px-4 py-3 text-left transition-colors hover:bg-mist/50"
                  >
                    <div>
                      <p className="text-sm font-medium">{s.file_name}</p>
                      <p className="text-xs text-ink-40">{s.bank_name ?? "—"} · {formatDate(s.created_at)}</p>
                    </div>
                    <span className="text-xs text-secondary">
                      {s.matched_count}/{s.transaction_count} matched
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <Empty message={loading ? "Loading…" : "No statements uploaded."} />
            )}
          </div>

          {/* Transactions */}
          <div>
            <h2 className="mb-4 text-lg font-light tracking-tight">
              {active ? `Transactions · ${active.file_name}` : "Transactions"}
            </h2>
            {active && active.transactions.length > 0 ? (
              <Table head={["Date", "Amount", "UTR", "Status"]}>
                {active.transactions.map((t) => (
                  <Row key={t.id}>
                    <Cell className="text-ink-40">{t.txn_date ? formatDate(t.txn_date) : "—"}</Cell>
                    <Cell className="font-medium">{formatINR(t.amount)}</Cell>
                    <Cell className="text-ink-40">{t.utr_reference ?? "—"}</Cell>
                    <Cell>
                      <StatusPill status={t.verification_status} />
                    </Cell>
                  </Row>
                ))}
              </Table>
            ) : (
              <Empty message="Select a statement to view matched transactions." />
            )}
          </div>
        </div>
      </div>
    </PortalShell>
  );
}
