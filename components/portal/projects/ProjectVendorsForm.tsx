"use client";

import { useState } from "react";
import { Modal, ModalFooter } from "@/components/portal/Modal";
import { Field, inputClass } from "@/components/portal/ui";
import { Button } from "@/components/ui/Button";
import { api, ApiError, type ProjectDetail } from "@/lib/api";
import { formatINR } from "@/lib/utils";
import { NUMBER_RULES, TEXT_MAX } from "@/lib/validation";

const num = (v: string) => (v.trim() === "" ? 0 : Number(v));

/**
 * The scope of work printed on every vendor's work order, and the vendor budget.
 * Vendors themselves are assigned per service with "Assign vendor".
 */
export function ProjectVendorsForm({
  open,
  onOpenChange,
  project,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  project: ProjectDetail;
  onSaved: (saved: ProjectDetail) => void;
}) {
  const [description, setDescription] = useState(project.description ?? "");
  const [budgetInput, setBudgetInput] = useState(String(project.budget));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const saved = await api.patch<ProjectDetail>(`/projects/${project.id}`, { description, budget: num(budgetInput) });
      onOpenChange(false);
      onSaved(saved);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="wide"
      title="Scope and vendor budget"
      description="The scope of work is printed on each vendor's work order. The budget is what you plan to spend on vendors."
    >
      <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="sm:col-span-3">
          <Field label="Scope of work">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              maxLength={TEXT_MAX}
              placeholder="What will be delivered, where, and how it will be reported. This goes on each vendor's work order."
              className={`${inputClass} h-auto py-2.5`}
            />
          </Field>
        </div>
        <Field label="Vendor budget (₹)">
          <input {...NUMBER_RULES.money} value={budgetInput} onChange={(e) => setBudgetInput(e.target.value)} className={inputClass} />
        </Field>
        <p className="col-span-full text-sm text-secondary">
          Committed to vendors so far: {formatINR(project.committed_cost)}
        </p>

        {error && (
          <p role="alert" className="col-span-full text-sm text-danger">
            ⚠ {error}
          </p>
        )}
        <ModalFooter>
          <Button type="button" variant="secondary" magnetic={false} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" magnetic={false} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
