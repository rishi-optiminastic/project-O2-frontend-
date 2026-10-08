"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { motion } from "framer-motion";

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  size = "md",
  children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: string;
  /** "wide" fits forms laid out four fields across. */
  size?: "md" | "wide";
  children: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[120] bg-foreground/25 backdrop-blur-sm" />
        <Dialog.Content
          className={
            "fixed left-1/2 top-1/2 z-[121] -translate-x-1/2 -translate-y-1/2 focus:outline-none " +
            (size === "wide" ? "w-[min(94vw,1080px)]" : "w-[min(92vw,640px)]")
          }
          asChild
        >
          <motion.div
            initial={{ opacity: 0, y: 14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="glass-strong flex max-h-[88vh] flex-col overflow-hidden rounded-3xl"
          >
            {/* Pinned header — stays visible while the body scrolls */}
            <div className="flex items-start justify-between gap-6 border-b border-line/50 px-7 py-5">
              <div>
                <Dialog.Title className="text-xl font-light tracking-tight">{title}</Dialog.Title>
                {description && (
                  <Dialog.Description className="mt-1 text-sm font-light text-secondary">
                    {description}
                  </Dialog.Description>
                )}
              </div>
              <Dialog.Close className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line text-ink-40 transition-colors hover:bg-foreground/[0.05] hover:text-foreground">
                <X className="h-4 w-4" />
              </Dialog.Close>
            </div>
            {/* Scrollable body */}
            <div className="overflow-y-auto px-7 py-6">{children}</div>
          </motion.div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * Sticky action bar for modal forms — pins the Cancel / Save buttons to the
 * bottom of the dialog so they're always reachable, even on long forms.
 * Place it as the last child of a form; it spans the full width of grid forms.
 */
export function ModalFooter({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 -mx-7 -mb-6 mt-6 flex justify-end gap-3 border-t border-line/50 bg-white/80 px-7 py-4 backdrop-blur-md col-span-full">
      {children}
    </div>
  );
}
