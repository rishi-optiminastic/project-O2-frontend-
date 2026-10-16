"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Select } from "@/components/portal/Select";
import { ProjectForm } from "@/components/portal/projects/ProjectForm";
import { useAuth } from "@/lib/auth";
import { formatINR } from "@/lib/utils";
import type { Project, ProjectDetail } from "@/lib/api";

/** A project can be invoiced once it has a client and at least one service. */
export const invoiceable = (p: Project) => p.client_id !== null && p.services.length > 0;

/**
 * Required project picker for invoices. The project decides the client and the
 * services billed; roles that manage projects can create one on the spot.
 */
export function ProjectPicker({
  projects,
  value,
  onChange,
  onCreated,
}: {
  projects: Project[] | null | undefined;
  value: number | undefined;
  onChange: (project: Project) => void;
  /** Called with a project made from "+ New project", after which it is selected. */
  onCreated: (project: ProjectDetail) => void;
}) {
  const { hasRole } = useAuth();
  const [creating, setCreating] = useState(false);
  const canCreate = hasRole("ADMIN_CEO", "CFO", "FINANCE_MANAGER");
  const options = (projects ?? []).filter(invoiceable);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          {!projects ? (
            <Select options={[]} placeholder="Loading projects…" />
          ) : options.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line px-3.5 py-3 text-sm text-secondary">
              No project is ready to invoice yet.{" "}
              {canCreate ? "Create one to continue." : "Ask a Finance Manager to set up the project with its client and service."}
            </p>
          ) : (
            <Select
              name="project_id"
              required
              placeholder="Choose a project"
              value={value !== undefined ? String(value) : undefined}
              onValueChange={(v) => {
                const picked = options.find((p) => p.id === Number(v));
                if (picked) onChange(picked);
              }}
              options={options.map((p) => ({
                value: String(p.id),
                label: `${p.code} · ${p.title}${p.client_name ? ` · ${p.client_name}` : ""}`,
              }))}
            />
          )}
        </div>
        {canCreate && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-line px-4 py-2.5 text-sm font-medium transition-colors hover:bg-mist"
          >
            <Plus className="h-4 w-4" /> New project
          </button>
        )}
      </div>

      {creating && (
        // React events bubble through portals: keep the project form's submit away from the invoice form.
        <div onSubmit={(e) => e.stopPropagation()}>
          <ProjectForm
            stacked
            open={creating}
            onOpenChange={setCreating}
            onSaved={(saved) => {
              onCreated(saved);
              onChange(saved);
            }}
          />
        </div>
      )}
    </div>
  );
}

/** What the chosen project puts on the invoice, and how much of its contract is billed. */
export function ProjectSummary({ project }: { project: Project }) {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-2xl border border-line bg-mist/40 p-4 text-sm sm:grid-cols-3">
      <Item label="Client">{project.client_name}</Item>
      <Item label={project.services.length > 1 ? "Services" : "Service"}>
        {project.services.map((s) => s.title).join(", ")}
      </Item>
      <Item label="SAC">
        <span className="font-mono">{project.services.map((s) => s.sac_code ?? "-").join(", ")}</span>
      </Item>
      <Item label="Contract value">{project.contract_value ? formatINR(project.contract_value) : "Not set"}</Item>
      <Item label="Billed so far">{formatINR(project.billed)}</Item>
      <Item label="Left to bill">
        {project.left_to_bill != null ? (
          <span className={project.left_to_bill < 0 ? "text-danger" : undefined}>{formatINR(project.left_to_bill)}</span>
        ) : (
          "-"
        )}
      </Item>
      <p className="col-span-full text-xs text-ink-40">
        The client and services come from the project.{" "}
        <Link href={`/portal/projects/${project.id}`} target="_blank" className="underline underline-offset-2">
          Open project
        </Link>
      </p>
    </dl>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-ink-40">{label}</dt>
      <dd className="mt-0.5 truncate font-medium">{children}</dd>
    </div>
  );
}

/** A warning when this amount takes the project past its contract value; saving is still allowed. */
export function overContractWarning(project: Project | undefined, amount: number, alreadyOnThisInvoice = 0): string | null {
  if (!project || project.left_to_bill == null) return null;
  const left = project.left_to_bill + alreadyOnThisInvoice;
  if (amount <= left) return null;
  return `This takes ${project.code} ${formatINR(amount - left)} past its contract value of ${formatINR(project.contract_value)}. You can still save it.`;
}
