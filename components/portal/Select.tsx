"use client";

import * as RSelect from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SelectOption {
  value: string;
  label: string;
}

/**
 * Custom select built on @radix-ui/react-select — solid enough to read over any page, fully
 * keyboard-accessible. Supports native form submission via `name`.
 */
export function Select({
  options,
  name,
  defaultValue,
  value,
  onValueChange,
  placeholder = "Select…",
  required,
  className,
}: {
  options: SelectOption[];
  name?: string;
  defaultValue?: string;
  value?: string;
  onValueChange?: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  className?: string;
}) {
  return (
    <RSelect.Root
      name={name}
      defaultValue={defaultValue}
      value={value}
      onValueChange={onValueChange}
      required={required}
    >
      <RSelect.Trigger
        className={cn(
          "flex h-11 w-full items-center justify-between gap-2 rounded-xl border border-line bg-background px-3.5 text-sm outline-none transition-colors data-[state=open]:border-foreground/40 data-[placeholder]:text-ink-40",
          className,
        )}
      >
        <RSelect.Value placeholder={placeholder} />
        <RSelect.Icon>
          <ChevronDown className="h-4 w-4 text-ink-40" />
        </RSelect.Icon>
      </RSelect.Trigger>

      <RSelect.Portal>
        <RSelect.Content
          position="popper"
          sideOffset={6}
          className="popover-surface z-[130] max-h-72 w-[var(--radix-select-trigger-width)] overflow-hidden rounded-xl p-1 shadow-[0_30px_60px_-30px_rgba(17,17,17,0.35)]"
        >
          <RSelect.Viewport>
            {options.map((o) => (
              <RSelect.Item
                key={o.value}
                value={o.value}
                className="flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-sm text-foreground outline-none data-[highlighted]:bg-foreground/[0.06] data-[state=checked]:font-medium"
              >
                <RSelect.ItemText>{o.label}</RSelect.ItemText>
                <RSelect.ItemIndicator>
                  <Check className="h-4 w-4" strokeWidth={1.6} />
                </RSelect.ItemIndicator>
              </RSelect.Item>
            ))}
          </RSelect.Viewport>
        </RSelect.Content>
      </RSelect.Portal>
    </RSelect.Root>
  );
}
