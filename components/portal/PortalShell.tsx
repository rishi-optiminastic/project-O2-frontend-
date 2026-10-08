"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  LayoutDashboard,
  Users,
  FileText,
  FolderKanban,
  Truck,
  Handshake,
  Layers,
  Receipt,
  FileBarChart,
  ShieldCheck,
  CheckCircle2,
  ScrollText,
  UserPlus,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { useAuth, ROLE_LABELS } from "@/lib/auth";
import { canAccessPath } from "@/lib/rbac";
import { FloatingOrb } from "@/components/orb/FloatingOrb";
import { Logo } from "@/components/ui/Logo";
import { GridLoader } from "@/components/ui/GridLoader";
import { GlobalSearch } from "@/components/portal/GlobalSearch";
import { cn } from "@/lib/utils";

const navGroups = [
  {
    title: "Main Menu",
    items: [
      { href: "/portal", label: "Dashboard", icon: LayoutDashboard, exact: true },
      { href: "/portal/invoices", label: "Invoices", icon: FileText },
      { href: "/portal/projects", label: "Projects", icon: FolderKanban },
      { href: "/portal/taxation", label: "Taxation", icon: Receipt },
      { href: "/portal/reports", label: "Reports", icon: FileBarChart },
    ],
  },
  {
    title: "Onboarding",
    items: [
      { href: "/portal/agents", label: "Agents", icon: Handshake },
      { href: "/portal/clients", label: "Clients", icon: Users },
      { href: "/portal/vendors", label: "Vendors", icon: Truck },
      { href: "/portal/services", label: "Services", icon: Layers },
    ],
  },
  {
    title: "Management",
    items: [
      { href: "/portal/approvals", label: "Approvals", icon: ShieldCheck },
      { href: "/portal/verification", label: "Verification", icon: CheckCircle2 },
      { href: "/portal/audit", label: "Audit Trail", icon: ScrollText },
      { href: "/portal/team", label: "Admin", icon: UserPlus },
    ],
  },
];

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function PortalShell({ children }: { children: ReactNode }) {
  const { user, loading, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/portal/login");
  }, [loading, user, router]);

  // Route block: a role hitting a module it can't access is bounced to the dashboard.
  useEffect(() => {
    if (!loading && user && !canAccessPath(user.role, pathname)) router.replace("/portal");
  }, [loading, user, pathname, router]);

  // Persist collapse preference across navigation.
  useEffect(() => {
    setCollapsed(window.localStorage.getItem("o2_sidebar_collapsed") === "1");
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c;
      window.localStorage.setItem("o2_sidebar_collapsed", next ? "1" : "0");
      return next;
    });
  };

  // While loading, logged out, or redirecting away from a forbidden module.
  if (loading || !user || !canAccessPath(user.role, pathname)) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-7">
        <GridLoader />
        <p className="tracking-eyebrow text-[11px] text-ink-40">Project O2</p>
      </div>
    );
  }

  // Only show nav items this role is allowed to open.
  const groups = navGroups
    .map((g) => ({ ...g, items: g.items.filter((it) => canAccessPath(user.role, it.href)) }))
    .filter((g) => g.items.length > 0);
  const visibleItems = groups.flatMap((g) => g.items);

  return (
    <div className="relative min-h-screen overflow-x-clip">
      {/* Ambient orbs — same motif as the marketing site */}
      <FloatingOrb size={520} variant="ambient" speed={22} opacity={0.25} className="-right-40 top-10" parallax={30} />
      <FloatingOrb size={360} variant="ambient" speed={18} opacity={0.2} className="-left-32 bottom-0" />

      <div className="relative z-10 flex">
        {/* Sidebar */}
        <aside
          className={cn(
            "sticky top-0 z-30 hidden h-screen shrink-0 flex-col border-r border-white/50 bg-white/35 py-6 backdrop-blur-2xl transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] lg:flex",
            collapsed ? "w-[78px] px-3" : "w-64 px-4",
          )}
        >
          {/* Collapse toggle — straddles the right edge */}
          <button
            onClick={toggleCollapsed}
            title={collapsed ? "Expand" : "Collapse"}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="absolute -right-3 top-8 z-30 flex h-6 w-6 items-center justify-center rounded-full border border-white/55 bg-white text-ink-40 shadow-[0_4px_12px_-6px_rgba(17,17,17,0.35)] transition-colors hover:text-foreground"
          >
            {collapsed ? <PanelLeftOpen className="h-3.5 w-3.5" /> : <PanelLeftClose className="h-3.5 w-3.5" />}
          </button>

          {/* Brand */}
          <Link
            href="/portal"
            className={cn("mb-8 flex items-center", collapsed ? "justify-center" : "gap-3 px-1")}
            title={collapsed ? "Project O2 by Optiminastic" : undefined}
          >
            <Logo size={36} />
            {!collapsed && (
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium leading-tight">Project O2</span>
                <span className="block text-[10px] tracking-eyebrow text-ink-40">by Optiminastic</span>
              </span>
            )}
          </Link>

          <nav className="flex flex-1 flex-col gap-6 overflow-y-auto">
            {groups.map((group) => (
              <div key={group.title}>
                {!collapsed ? (
                  <p className="mb-2 px-3 text-[10px] tracking-eyebrow text-ink-40">{group.title}</p>
                ) : (
                  <div className="mx-auto mb-2 h-px w-6 bg-white/70" />
                )}
                <div className="flex flex-col gap-0.5">
                  {group.items.map((item) => {
                    const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        title={collapsed ? item.label : undefined}
                        className={cn(
                          "group relative flex items-center rounded-xl text-sm font-light transition-colors",
                          collapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5",
                          active ? "text-foreground" : "text-secondary hover:text-foreground",
                        )}
                      >
                        {active && (
                          <motion.span
                            layoutId="portal-active"
                            className="absolute inset-0 -z-10 rounded-xl bg-[#d9e1f6]"
                            transition={{ type: "spring", stiffness: 300, damping: 30 }}
                          />
                        )}
                        <item.icon className="h-4 w-4 shrink-0" strokeWidth={1.5} />
                        {!collapsed && item.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
        </aside>

        {/* Main */}
        <div className="min-w-0 flex-1">
          {/* Desktop top bar */}
          <header className="sticky top-0 z-20 hidden items-center justify-end gap-3 border-b border-white/50 bg-white/35 px-10 py-4 backdrop-blur-2xl lg:flex">
            <GlobalSearch />
            {/* User — avatar only; opens a dropdown with name + sign out */}
            <div className="ml-1 border-l border-white/55 pl-4">
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <button
                    title={user.name}
                    aria-label={`Account menu for ${user.name}`}
                    className="metallic flex h-10 w-10 items-center justify-center rounded-full text-xs font-medium text-foreground/70 outline-none transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-foreground/30"
                  >
                    {initials(user.name)}
                  </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content
                    align="end"
                    sideOffset={10}
                    className="popover-surface z-[120] w-60 rounded-2xl p-2 shadow-[0_30px_60px_-30px_rgba(17,17,17,0.35)]"
                  >
                    <div className="flex items-center gap-3 px-3 py-2.5">
                      <span className="metallic flex h-9 w-9 items-center justify-center rounded-full text-xs font-medium text-foreground/70">
                        {initials(user.name)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium leading-tight">{user.name}</p>
                        <p className="truncate text-[11px] text-ink-40">{ROLE_LABELS[user.role]}</p>
                      </div>
                    </div>
                    <p className="truncate px-3 pb-2 text-[11px] text-ink-40">{user.email}</p>
                    <DropdownMenu.Separator className="my-1 h-px bg-line" />
                    <DropdownMenu.Item
                      onSelect={logout}
                      className="flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-foreground outline-none transition-colors data-[highlighted]:bg-foreground/[0.05]"
                    >
                      <LogOut className="h-4 w-4" strokeWidth={1.5} /> Sign out
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            </div>
          </header>

          {/* Mobile topbar */}
          <header className="sticky top-0 z-20 flex items-center justify-between border-b border-line/70 bg-background/70 px-5 py-4 backdrop-blur-xl lg:hidden">
            <Link href="/portal" className="flex items-center gap-2">
              <Logo size={26} rounded="rounded-lg" />
              <span className="text-sm font-medium">Project O2</span>
            </Link>
            <button onClick={logout} className="text-sm text-secondary">
              Sign out
            </button>
          </header>

          {/* Mobile nav scroller */}
          <div className="flex gap-2 overflow-x-auto border-b border-line/70 px-5 py-3 lg:hidden">
            {visibleItems.map((item) => {
              const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-light",
                    active ? "border-foreground/20 bg-foreground/[0.05] text-foreground" : "border-line text-secondary",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>

          <main className="px-5 py-8 md:px-10 md:py-12">
            <motion.div
              key={pathname}
              initial={{ opacity: 0, y: 16, filter: "blur(6px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              className="mx-auto max-w-6xl"
            >
              {children}
            </motion.div>
          </main>
        </div>
      </div>
    </div>
  );
}
