import type { Role } from "@/lib/api";

/**
 * Per-module access control (Hierarchical model).
 *
 * Any portal path NOT listed here is open to every authenticated role.
 * Keep this in sync with the backend guards in `app/core/rbac.py`.
 *
 *   Module        CEO  CFO  Mgr  Exec
 *   Agents         ✓    ✓    ✓    –
 *   Services       ✓    ✓    ✓    –   (everyone picks from the list on invoices)
 *   Projects       ✓    ✓    ✓    –   (edit and send work orders; every role views)
 *   Taxation       ✓    ✓    ✓    –
 *   Approvals      ✓    ✓    ✓    –
 *   Audit Trail    ✓    –    –    –
 *   (everything else: all four)
 */
const NON_EXEC: Role[] = ["ADMIN_CEO", "CFO", "FINANCE_MANAGER"];

const RESTRICTED: { prefix: string; roles: Role[] }[] = [
  { prefix: "/portal/agents", roles: NON_EXEC },
  { prefix: "/portal/services", roles: NON_EXEC },
  { prefix: "/portal/taxation", roles: NON_EXEC },
  { prefix: "/portal/approvals", roles: NON_EXEC },
  { prefix: "/portal/audit", roles: ["ADMIN_CEO"] },
  { prefix: "/portal/team", roles: ["ADMIN_CEO"] },
];

/** True if the given role may see/open the given portal path. */
export function canAccessPath(role: Role, pathname: string): boolean {
  const rule = RESTRICTED.find(
    (r) => pathname === r.prefix || pathname.startsWith(r.prefix + "/"),
  );
  return rule ? rule.roles.includes(role) : true;
}
