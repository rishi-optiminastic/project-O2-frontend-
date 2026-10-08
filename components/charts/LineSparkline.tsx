"use client";

import { cn } from "@/lib/utils";

/** Minimal line sparkline with a soft gradient fill — clean, legible KPI trend. */
export function LineSparkline({
  data,
  className,
  height = 40,
}: {
  data: number[];
  className?: string;
  height?: number;
}) {
  const W = 120;
  const H = height;
  const pad = 3;
  const max = Math.max(1, ...data);
  const min = Math.min(...data);
  const span = max - min || 1;
  const x = (i: number) => (data.length <= 1 ? W / 2 : (i / (data.length - 1)) * (W - pad * 2) + pad);
  const y = (v: number) => H - pad - ((v - min) / span) * (H - pad * 2);
  const pts = data.map((v, i) => `${x(i)},${y(v)}`);
  const line = `M ${pts.join(" L ")}`;
  const area = `${line} L ${x(data.length - 1)},${H} L ${x(0)},${H} Z`;
  const id = `spark-${data.slice(0, 3).join("-")}`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={cn("w-full", className)} style={{ height }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-foreground)" stopOpacity="0.14" />
          <stop offset="100%" stopColor="var(--color-foreground)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke="var(--color-foreground)" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
