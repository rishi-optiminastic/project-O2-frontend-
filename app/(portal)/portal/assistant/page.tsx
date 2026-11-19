"use client";

import { PortalShell } from "@/components/portal/PortalShell";
import { AssistantWorkspace } from "@/components/portal/assistant/AssistantWorkspace";
import { Empty } from "@/components/portal/ui";
import { useAuth } from "@/lib/auth";

/** Ask O2, full page. The CEO and CFO only. */
export default function AssistantPage() {
  const { hasRole } = useAuth();
  return (
    <PortalShell bleed startCollapsed>
      {hasRole("ADMIN_CEO", "CFO") ? (
        <AssistantWorkspace />
      ) : (
        <div className="p-10">
          <Empty message="Ask O2 is for the CEO and CFO." />
        </div>
      )}
    </PortalShell>
  );
}
