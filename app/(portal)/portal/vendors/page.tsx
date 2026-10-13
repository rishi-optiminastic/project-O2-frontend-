"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, BadgeCheck, Building2 } from "lucide-react";
import { PortalShell } from "@/components/portal/PortalShell";
import { PageHeading, Table, Row, Cell, Empty, StatusPill } from "@/components/portal/ui";
import { Modal, ModalFooter } from "@/components/portal/Modal";
import { VendorFields, vendorPayload } from "@/components/portal/vendors/VendorFields";
import { Button } from "@/components/ui/Button";
import { useApi } from "@/lib/useApi";
import { useAuth } from "@/lib/auth";
import { api, ApiError, type Vendor } from "@/lib/api";

export default function VendorsPage() {
  const { data, loading, refetch } = useApi<Vendor[]>("/vendors");
  const { hasRole } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const canManage = hasRole("ADMIN_CEO", "CFO", "FINANCE_MANAGER");

  async function verify(id: number) {
    setBusy(id);
    setErr(null);
    try {
      await api.post(`/vendors/${id}/verify`);
      refetch();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not verify");
    } finally {
      setBusy(null);
    }
  }

  return (
    <PortalShell>
      <div className="flex flex-col gap-8">
        <PageHeading
          title="Vendors"
          description="Onboarding is complete only when tax and bank details are verified."
          action={
            <Button size="sm" magnetic={false} onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" /> New vendor
            </Button>
          }
        />

        {err && <p className="text-sm text-danger">⚠ {err}</p>}

        {data && data.length > 0 ? (
          <Table head={["Vendor", "GST / PAN", "Bank", "Status", ""]}>
            {data.map((v) => (
              <Row key={v.id} onClick={() => router.push(`/portal/vendors/${v.id}`)}>
                <Cell className="font-medium">
                  {v.business_name}
                  <span className="block text-xs text-ink-40">{v.email}</span>
                </Cell>
                <Cell className="text-ink-40">
                  {v.gst_number ?? "—"}
                  <span className="block">{v.pan ?? ""}</span>
                </Cell>
                <Cell className="text-ink-40">
                  {v.bank_accounts[0]?.bank_name ?? "-"}
                  {v.bank_accounts.length > 1 && <span className="block text-xs">+{v.bank_accounts.length - 1} more</span>}
                </Cell>
                <Cell>
                  <StatusPill status={v.is_verified ? "Verified" : v.approval_status} />
                </Cell>
                <Cell>
                  {!v.is_verified && canManage && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        verify(v.id);
                      }}
                      disabled={busy === v.id}
                      className="inline-flex items-center gap-1.5 text-xs text-secondary transition-colors hover:text-foreground"
                    >
                      <BadgeCheck className="h-4 w-4" /> Verify
                    </button>
                  )}
                </Cell>
              </Row>
            ))}
          </Table>
        ) : (
          <Empty
            message={loading ? "Loading vendors…" : "No vendors onboarded yet. Add your first to start tracking payouts."}
            icon={<Building2 className="h-5 w-5" strokeWidth={1.6} />}
            action={
              loading ? undefined : (
                <Button size="sm" magnetic={false} onClick={() => setOpen(true)}>
                  <Plus className="h-4 w-4" /> New vendor
                </Button>
              )
            }
          />
        )}
      </div>

      <VendorForm open={open} onOpenChange={setOpen} onSaved={refetch} />
    </PortalShell>
  );
}

function VendorForm({ open, onOpenChange, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; onSaved: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.post("/vendors", vendorPayload(e.currentTarget));
      onOpenChange(false);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Onboard a vendor" description="Capture contact, tax and bank details. Add every account they may be paid into.">
      <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <VendorFields />
        {error && <p className="sm:col-span-2 text-sm text-danger">⚠ {error}</p>}
        <ModalFooter>
          <Button type="button" variant="secondary" magnetic={false} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" magnetic={false} disabled={saving}>
            {saving ? "Saving…" : "Save vendor"}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
