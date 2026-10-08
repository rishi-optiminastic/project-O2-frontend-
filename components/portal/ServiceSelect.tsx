"use client";

import Link from "next/link";
import { Select } from "@/components/portal/Select";
import { useAuth } from "@/lib/auth";
import type { Service } from "@/lib/api";

/** Required service picker for invoices, fed by the active service catalogue. */
export function ServiceSelect({
  services,
  value,
  onChange,
}: {
  services: Service[] | null | undefined;
  value: number | undefined;
  onChange: (service: Service) => void;
}) {
  const { hasRole } = useAuth();

  if (!services) return <Select options={[]} placeholder="Loading services…" />;

  if (services.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-line px-3.5 py-3 text-sm text-secondary">
        No services yet.{" "}
        {hasRole("ADMIN_CEO", "CFO", "FINANCE_MANAGER") ? (
          <Link href="/portal/services" className="font-medium text-foreground underline underline-offset-2">
            Add one on the Services page
          </Link>
        ) : (
          "Ask a Finance Manager to add your services."
        )}
      </p>
    );
  }

  return (
    <Select
      name="service_id"
      required
      placeholder="Choose a service"
      value={value !== undefined ? String(value) : undefined}
      onValueChange={(v) => {
        const picked = services.find((s) => s.id === Number(v));
        if (picked) onChange(picked);
      }}
      options={services.map((s) => ({ value: String(s.id), label: s.sac_code ? `${s.title} · SAC ${s.sac_code}` : s.title }))}
    />
  );
}
