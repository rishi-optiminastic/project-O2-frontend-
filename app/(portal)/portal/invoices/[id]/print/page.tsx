"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";
import { InvoiceDocument } from "@/components/invoice/InvoiceDocument";
import { Button } from "@/components/ui/Button";
import { GridLoader } from "@/components/ui/GridLoader";
import { useApi } from "@/lib/useApi";
import { useAuth } from "@/lib/auth";
import type { InvoiceDocumentView } from "@/lib/api";

/** The proforma / tax invoice on its own page, ready to print or save as PDF. */
export default function InvoicePrintPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { data: view, error } = useApi<InvoiceDocumentView>(user ? `/invoices/${id}/document` : null);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/portal/login");
  }, [authLoading, user, router]);

  return (
    <main className="min-h-screen bg-mist/60 px-4 py-6 print:bg-white print:p-0">
      <div className="mx-auto mb-4 flex max-w-[210mm] items-center justify-between gap-4 print:hidden">
        <Link
          href={`/portal/invoices/${id}`}
          className="inline-flex items-center gap-1.5 text-sm text-secondary transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to invoice
        </Link>
        <Button size="sm" magnetic={false} onClick={() => window.print()} disabled={!view}>
          <Printer className="h-4 w-4" /> Print or save PDF
        </Button>
      </div>

      {view ? (
        <InvoiceDocument view={view} />
      ) : error ? (
        <p className="mx-auto max-w-md pt-16 text-center text-secondary">{error}</p>
      ) : (
        <div className="flex min-h-[60vh] items-center justify-center">
          <GridLoader />
        </div>
      )}
    </main>
  );
}
