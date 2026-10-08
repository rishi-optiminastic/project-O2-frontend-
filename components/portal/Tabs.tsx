"use client";

import { motion } from "framer-motion";

export interface TabItem<K extends string> {
  key: K;
  label: string;
  /** Small count shown after the label, e.g. items needing action. */
  badge?: number;
}

/** Pill tab switcher. `layoutId` must be unique per page so the highlight animates within one switcher. */
export function Tabs<K extends string>({
  tabs,
  active,
  onChange,
  layoutId,
  label,
}: {
  tabs: TabItem<K>[];
  active: K;
  onChange: (key: K) => void;
  layoutId: string;
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="flex w-full max-w-full items-center gap-1 overflow-x-auto rounded-full border border-line bg-white/50 p-1 sm:w-fit">
      {tabs.map((t) => (
        <button
          key={t.key}
          role="tab"
          aria-selected={active === t.key}
          onClick={() => onChange(t.key)}
          className={
            "relative shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-xs font-medium transition-colors " +
            (active === t.key ? "text-background" : "text-secondary hover:text-foreground")
          }
        >
          {active === t.key && (
            <motion.span
              layoutId={layoutId}
              className="absolute inset-0 -z-10 rounded-full bg-foreground"
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            />
          )}
          {t.label}
          {t.badge ? (
            <span
              className={
                "ml-1.5 inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] " +
                (active === t.key ? "bg-background/20" : "bg-foreground/10")
              }
            >
              {t.badge}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
