"use client";

import { useState } from "react";
import { Modal, ModalFooter } from "@/components/portal/Modal";
import { Button } from "@/components/ui/Button";
import { useApi } from "@/lib/useApi";
import { api, ApiError, type Service, type Vendor, type VendorAssignment } from "@/lib/api";

/**
 * Edit the catalogue services a vendor provides. A service the vendor is assigned
 * on a project stays ticked until that assignment is removed from the project.
 */
export function VendorServicesForm({
  open,
  onOpenChange,
  vendor,
  assignments,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  vendor: Vendor;
  assignments: VendorAssignment[];
  onSaved: (saved: Vendor) => void;
}) {
  const { data: catalogue } = useApi<Service[]>(open ? "/services" : null);
  const [ticked, setTicked] = useState<Set<number>>(() => new Set(vendor.services.map((s) => s.id)));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Codes per service, so a locked row can say where it is in use.
  const inUse = new Map<number, string[]>();
  for (const a of assignments) inUse.set(a.service_id, [...(inUse.get(a.service_id) ?? []), a.code]);

  // Active catalogue services, plus any the vendor already has that were since deactivated.
  const rows = [
    ...(catalogue ?? []),
    ...vendor.services.filter((s) => !(catalogue ?? []).some((c) => c.id === s.id)),
  ].sort((a, b) => a.title.localeCompare(b.title));

  function toggle(id: number) {
    setTicked((all) => {
      const next = new Set(all);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const saved = await api.put<Vendor>(`/vendors/${vendor.id}/services`, { service_ids: [...ticked] });
      onOpenChange(false);
      onSaved(saved);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save the services");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={`Services ${vendor.business_name} provides`}
      description="Projects can assign this vendor only for the services ticked here."
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        {catalogue === null || catalogue === undefined ? (
          <p className="text-sm text-ink-40">Loading the service catalogue…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-ink-40">The service catalogue is empty. Add services on the Services page first.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line/60 rounded-2xl border border-line">
            {rows.map((s) => {
              const codes = inUse.get(s.id);
              const locked = !!codes && ticked.has(s.id);
              return (
                <li key={s.id}>
                  <label className={"flex items-start gap-3 px-4 py-3 " + (locked ? "cursor-not-allowed" : "cursor-pointer")}>
                    <input
                      type="checkbox"
                      checked={ticked.has(s.id)}
                      disabled={locked}
                      onChange={() => toggle(s.id)}
                      className="mt-0.5 h-4 w-4 accent-foreground"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="text-sm font-medium">{s.title}</span>
                      <span className="ml-2 rounded-md border border-line bg-mist/60 px-1.5 py-0.5 font-mono text-[11px] text-secondary">SAC {s.sac_code ?? "—"}</span>
                      {!s.is_active && <span className="ml-1.5 text-xs text-warning">Deactivated</span>}
                      {codes && (
                        <span className="block text-xs text-ink-40">
                          Assigned on a project ({codes.join(", ")}), so it stays on the list
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}

        {error && (
          <p role="alert" className="text-sm text-danger">
            ⚠ {error}
          </p>
        )}
        <ModalFooter>
          <Button type="button" variant="secondary" magnetic={false} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" magnetic={false} disabled={saving || !catalogue}>
            {saving ? "Saving…" : `Save ${ticked.size} service${ticked.size === 1 ? "" : "s"}`}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
