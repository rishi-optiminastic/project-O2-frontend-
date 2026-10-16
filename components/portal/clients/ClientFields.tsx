"use client";

import { useState } from "react";
import { Field, inputClass } from "@/components/portal/ui";
import { GstField } from "@/components/portal/GstField";
import { AgentSelect } from "@/components/portal/AgentSelect";
import { Select } from "@/components/portal/Select";
import type { AgentOption, Client } from "@/lib/api";
import { FIELD_RULES, NAME_MAX, TEXT_MAX } from "@/lib/validation";

const MSME_OPTIONS = [
  { value: "no", label: "No" },
  { value: "yes", label: "Yes" },
];

/** The client intake fields, shared by the create and edit forms. */
export function ClientFields({ client, agents }: { client?: Client; agents: AgentOption[] | null }) {
  const [msme, setMsme] = useState(client?.msme ?? false);

  return (
    <>
      <Field label="Business name">
        <input name="business_name" maxLength={NAME_MAX} required defaultValue={client?.business_name} className={inputClass} />
      </Field>
      <Field label="Official email">
        <input name="email" type="email" required defaultValue={client?.email} className={inputClass} />
      </Field>
      <GstField defaultValue={client?.gst_number} />
      <Field label="Referral agent">
        <AgentSelect options={agents} defaultValue={client?.agent_id} />
      </Field>
      <div className="sm:col-span-2">
        <Field label="Address">
          <textarea
            name="billing_address"
            maxLength={TEXT_MAX}
            rows={2}
            defaultValue={client?.billing_address ?? ""}
            className={inputClass + " h-auto py-2.5"}
          />
        </Field>
      </div>
      <Field label="COI (optional)">
        <input name="coi" {...FIELD_RULES.cin} defaultValue={client?.coi ?? ""} className={inputClass} />
      </Field>
      <Field label="MSME">
        <Select name="msme" options={MSME_OPTIONS} value={msme ? "yes" : "no"} onValueChange={(v) => setMsme(v === "yes")} />
      </Field>
      {msme && (
        <Field label="MSME number (Udyam, optional)">
          <input name="msme_number" {...FIELD_RULES.udyam} defaultValue={client?.msme_number ?? ""} className={inputClass} />
        </Field>
      )}
    </>
  );
}

/** The request body for the fields above. */
export function clientBody(fd: FormData) {
  return {
    ...Object.fromEntries(fd),
    agent_id: Number(fd.get("agent_id")),
    msme: fd.get("msme") === "yes",
  };
}
