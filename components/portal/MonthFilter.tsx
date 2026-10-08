"use client";

import { CalendarDays } from "lucide-react";
import { Select } from "@/components/portal/Select";
import { monthOptions, useMonth } from "@/lib/month";
import { cn } from "@/lib/utils";

/** Month picker shared across the portal: every month-aware list follows it. */
export function MonthFilter({ className }: { className?: string }) {
  const [month, setMonth] = useMonth();
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <CalendarDays className="h-4 w-4 shrink-0 text-ink-40" aria-hidden />
      <Select
        value={month}
        onValueChange={setMonth}
        options={monthOptions()}
        className="w-48"
        placeholder="Month"
      />
    </div>
  );
}
