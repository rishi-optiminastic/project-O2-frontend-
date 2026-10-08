"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export interface TrendDatum {
  label: string;
  value: number;
}

/** Smooth Catmull-Rom → cubic-bezier path through the points. */
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

/**
 * A clean, legible revenue area chart: smooth line, gradient fill, y gridlines,
 * x labels, and a hover tooltip that reads out each point's value.
 */
export function AreaTrendChart({
  data,
  format = (n) => String(n),
  className,
}: {
  data: TrendDatum[];
  format?: (n: number) => string;
  className?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);

  const W = 760;
  const H = 240;
  const padX = 6;
  const padTop = 18;
  const padBottom = 22;
  const innerW = W - padX * 2;
  const innerH = H - padTop - padBottom;

  const max = Math.max(1, ...data.map((d) => d.value));
  const x = (i: number) =>
    data.length <= 1 ? padX + innerW / 2 : padX + (i / (data.length - 1)) * innerW;
  const y = (v: number) => padTop + innerH - (v / max) * innerH;

  const pts = data.map((d, i) => ({ x: x(i), y: y(d.value), ...d }));
  const line = smoothPath(pts);
  const area =
    pts.length > 0
      ? `${line} L ${pts[pts.length - 1].x} ${padTop + innerH} L ${pts[0].x} ${padTop + innerH} Z`
      : "";

  const grid = [max, max * 0.5, 0];

  return (
    <div className={cn("relative w-full", className)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: "auto" }}>
        <defs>
          <linearGradient id="area-trend-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-foreground)" stopOpacity="0.16" />
            <stop offset="100%" stopColor="var(--color-foreground)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* horizontal gridlines */}
        {grid.map((gv, i) => (
          <line
            key={i}
            x1={padX}
            x2={W - padX}
            y1={y(gv)}
            y2={y(gv)}
            stroke="var(--color-line)"
            strokeWidth={1}
            strokeDasharray={i === grid.length - 1 ? "0" : "3 5"}
          />
        ))}

        {area && <path d={area} fill="url(#area-trend-fill)" />}
        {line && (
          <path
            d={line}
            fill="none"
            stroke="var(--color-foreground)"
            strokeWidth={2.25}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* hovered vertical guide + point */}
        {hover !== null && pts[hover] && (
          <>
            <line
              x1={pts[hover].x}
              x2={pts[hover].x}
              y1={padTop - 6}
              y2={padTop + innerH}
              stroke="var(--color-ink-40)"
              strokeWidth={1}
            />
            <circle cx={pts[hover].x} cy={pts[hover].y} r={4.5} fill="var(--color-foreground)" />
          </>
        )}

        {/* invisible hover targets */}
        {pts.map((p, i) => (
          <rect
            key={i}
            x={p.x - innerW / (data.length * 2)}
            y={0}
            width={innerW / Math.max(1, data.length)}
            height={H}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          />
        ))}
      </svg>

      {/* x-axis labels */}
      <div className="mt-1 flex justify-between px-1 text-[11px] text-ink-40">
        {data.map((d, i) => (
          <span key={i} className="tabular-nums">
            {d.label}
          </span>
        ))}
      </div>

      {/* hover tooltip */}
      {hover !== null && pts[hover] && (
        <div
          className="pointer-events-none absolute top-0 -translate-x-1/2 -translate-y-1 rounded-lg border border-line bg-white/90 px-2.5 py-1.5 text-center shadow-sm backdrop-blur"
          style={{ left: `${(pts[hover].x / W) * 100}%` }}
        >
          <span className="block text-[10px] text-ink-40">{data[hover].label}</span>
          <span className="text-xs font-medium tabular-nums">{format(data[hover].value)}</span>
        </div>
      )}
    </div>
  );
}
