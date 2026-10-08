import { formatINR } from "@/lib/utils";

/** Vendor cost committed against the project budget, as a bar plus figures. */
export function BudgetBar({ committed, budget }: { committed: number; budget: number }) {
  const over = committed > budget;
  const percent = budget > 0 ? Math.min((committed / budget) * 100, 100) : committed > 0 ? 100 : 0;
  return (
    <div className="flex flex-col gap-1.5">
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-line"
        role="meter"
        aria-label="Budget used"
        aria-valuemin={0}
        aria-valuemax={budget}
        aria-valuenow={committed}
      >
        <div className={"h-full rounded-full " + (over ? "bg-foreground" : "bg-foreground/60")} style={{ width: `${percent}%` }} />
      </div>
      <span className="text-xs tabular-nums text-ink-40">
        {formatINR(committed)} of {formatINR(budget)}
        {over && <span className="font-medium text-foreground"> · over budget</span>}
      </span>
    </div>
  );
}
