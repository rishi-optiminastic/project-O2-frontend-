"use client";

import { PortalShell } from "@/components/portal/PortalShell";
import { PluginsSettings } from "@/components/portal/assistant/PluginsSettings";
import { Empty } from "@/components/portal/ui";
import { useAuth } from "@/lib/auth";

/** Ask O2 plugins and saved commands. The CEO and CFO only; the CEO manages them. */
export default function AssistantPluginsPage() {
  const { hasRole } = useAuth();
  return (
    <PortalShell>
      {hasRole("ADMIN_CEO", "CFO") ? <PluginsSettings /> : <Empty message="Ask O2 is for the CEO and CFO." />}
    </PortalShell>
  );
}
