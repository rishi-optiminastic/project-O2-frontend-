"use client";

import { Select } from "@/components/portal/Select";
import type { AgentOption } from "@/lib/api";

/** Display label: the in-house agent says plainly that it earns nothing. */
export function agentLabel(agent: Pick<AgentOption, "business_name" | "is_house">): string {
  return agent.is_house ? `${agent.business_name} (in-house, no commission)` : agent.business_name;
}

export function houseAgentId(options: AgentOption[] | null | undefined): number | undefined {
  return options?.find((a) => a.is_house)?.id;
}

/**
 * Required agent picker. Every client and invoice has an agent; when nobody
 * referred the client, it is the in-house agent, which is the default here.
 */
export function AgentSelect({
  options,
  name = "agent_id",
  value,
  defaultValue,
  onValueChange,
}: {
  options: AgentOption[] | null | undefined;
  name?: string;
  value?: number;
  defaultValue?: number;
  onValueChange?: (agentId: number) => void;
}) {
  if (!options) return <Select options={[]} placeholder="Loading agents…" />;

  const fallback = defaultValue ?? houseAgentId(options);
  return (
    <Select
      // Remount once options arrive so the uncontrolled default applies.
      key={`${options.length}-${fallback}`}
      name={name}
      required
      value={value !== undefined ? String(value) : undefined}
      defaultValue={value === undefined && fallback !== undefined ? String(fallback) : undefined}
      onValueChange={onValueChange ? (v) => onValueChange(Number(v)) : undefined}
      options={options.map((a) => ({ value: String(a.id), label: agentLabel(a) }))}
    />
  );
}
