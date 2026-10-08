import type { ReactNode } from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Invoice",
  // Token links are private: never let them be indexed or shared via referrers.
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function PublicLayout({ children }: { children: ReactNode }) {
  return <div className="relative min-h-screen px-4 py-10 sm:px-6 print:p-0">{children}</div>;
}
