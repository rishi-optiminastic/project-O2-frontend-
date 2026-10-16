"use client";

import { useState } from "react";
import { Plus, Landmark } from "lucide-react";
import { PortalShell } from "@/components/portal/PortalShell";
import { PageHeading, Table, Row, Cell, Empty, Field, inputClass, StatusPill } from "@/components/portal/ui";
import { Modal, ModalFooter } from "@/components/portal/Modal";
import { Button } from "@/components/ui/Button";
import { useApi } from "@/lib/useApi";
import { api, ApiError, type CompanyBank } from "@/lib/api";
import { NAME_MAX } from "@/lib/validation";

/** Our bank accounts that clients pay into. Receipts pick from this list. */
export default function BanksPage() {
  const { data, loading, refetch } = useApi<CompanyBank[]>("/banks?include_inactive=true");
  const [editing, setEditing] = useState<CompanyBank | "new" | null>(null);

  const newButton = (
    <Button size="sm" magnetic={false} onClick={() => setEditing("new")}>
      <Plus className="h-4 w-4" /> New bank
    </Button>
  );

  return (
    <PortalShell>
      <div className="flex flex-col gap-8">
        <PageHeading
          title="Banks"
          description="The accounts clients pay into. Each receipt records which one the money came into."
          action={newButton}
        />

        {loading && !data ? (
          <Empty message="Loading banks…" />
        ) : data && data.length > 0 ? (
          <Table head={["Bank", "Account", "Status"]}>
            {data.map((b) => (
              <Row key={b.id} onClick={() => setEditing(b)}>
                <Cell className="font-medium">{b.name}</Cell>
                <Cell className="font-mono text-secondary">····{b.account_last4}</Cell>
                <Cell>
                  <StatusPill status={b.is_active ? "Active" : "Inactive"} />
                </Cell>
              </Row>
            ))}
          </Table>
        ) : (
          <Empty
            icon={<Landmark className="h-5 w-5" />}
            message="No banks yet. Add the accounts clients pay into, e.g. IndusInd Bank ending 2018."
            action={newButton}
          />
        )}
      </div>

      {editing && (
        <BankForm
          bank={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refetch();
          }}
        />
      )}
    </PortalShell>
  );
}

function BankForm({ bank, onClose, onSaved }: { bank: CompanyBank | null; onClose: () => void; onSaved: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function run(action: () => Promise<unknown>) {
    setSaving(true);
    setError(null);
    try {
      await action();
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save");
      setSaving(false);
    }
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body = { name: fd.get("name"), account_last4: fd.get("account_last4") };
    run(() => (bank ? api.patch(`/banks/${bank.id}`, body) : api.post("/banks", body)));
  }

  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      title={bank ? "Edit bank" : "New bank"}
      description="Only the last four digits of the account are kept. Receipts already recorded keep the name they were saved with."
    >
      <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <Field label="Bank name">
            <input name="name" required maxLength={NAME_MAX} defaultValue={bank?.name} placeholder="IndusInd Bank" className={inputClass} />
          </Field>
        </div>
        <Field label="Last 4 digits">
          <input
            name="account_last4"
            required
            inputMode="numeric"
            pattern="[0-9]{4}"
            maxLength={4}
            title="The last 4 digits of the account number"
            defaultValue={bank?.account_last4}
            placeholder="2018"
            className={`${inputClass} font-mono`}
          />
        </Field>

        {error && <p role="alert" className="sm:col-span-3 text-sm text-danger">⚠ {error}</p>}
        <ModalFooter>
          {bank && (
            <>
              <Button
                type="button"
                variant="secondary"
                magnetic={false}
                disabled={saving}
                onClick={() => run(() => api.patch(`/banks/${bank.id}`, { is_active: !bank.is_active }))}
              >
                {bank.is_active ? "Deactivate" : "Reactivate"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                magnetic={false}
                disabled={saving}
                onClick={() => confirm(`Delete ${bank.label}? This cannot be undone.`) && run(() => api.del(`/banks/${bank.id}`))}
              >
                Delete
              </Button>
            </>
          )}
          <Button type="submit" magnetic={false} disabled={saving}>
            {saving ? "Saving…" : bank ? "Save changes" : "Add bank"}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
