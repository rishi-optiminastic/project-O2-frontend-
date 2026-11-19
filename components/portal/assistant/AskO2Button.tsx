"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sparkles } from "lucide-react";
import { useAuth } from "@/lib/auth";

/** Opens Ask O2, the assistant page. Shown only to the CEO and CFO. */
export function AskO2Button({ compact = false }: { compact?: boolean }) {
  const { hasRole } = useAuth();
  const pathname = usePathname();
  if (!hasRole("ADMIN_CEO", "CFO") || pathname.startsWith("/portal/assistant")) return null;
  return (
    <Link
      href="/portal/assistant"
      className={
        "inline-flex items-center gap-2 rounded-full border border-line bg-background/70 text-sm font-medium transition-colors hover:border-foreground/30 " +
        (compact ? "h-9 px-3" : "h-10 px-4")
      }
    >
      <Sparkles className="h-4 w-4" aria-hidden /> Ask O2
    </Link>
  );
}
