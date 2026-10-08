import type { PublicInvoiceView } from "@/lib/api";
import { formatDate, formatINR } from "@/lib/utils";

const RUPEES = { minimumFractionDigits: 2, maximumFractionDigits: 2 };
const money = (v: number) => formatINR(v, RUPEES);

/** A printable proforma or GST tax invoice, built from what the client is allowed to see. */
export function InvoiceDocument({ view }: { view: PublicInvoiceView }) {
  const { invoice, client, company } = view;
  const title = invoice.is_issued ? "Tax Invoice" : "Proforma Invoice";
  const date = invoice.is_issued ? invoice.invoice_date : invoice.proforma_date;

  return (
    <article className="rounded-[28px] border border-line bg-white p-6 text-sm text-foreground sm:p-10 print:rounded-none print:border-0 print:p-0">
      <header className="flex flex-col gap-6 border-b border-line pb-6 sm:flex-row sm:justify-between">
        <div className="min-w-0">
          <p className="text-lg font-semibold">{company.legal_name || "Supplier details not configured"}</p>
          {company.address && <p className="mt-1 whitespace-pre-line text-secondary">{company.address}</p>}
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 text-secondary">
            {company.gstin && (<><dt>GSTIN</dt><dd className="font-medium text-foreground">{company.gstin}</dd></>)}
            {company.state && (<><dt>State</dt><dd>{company.state}</dd></>)}
            {company.pan && (<><dt>PAN</dt><dd>{company.pan}</dd></>)}
            {company.email && (<><dt>Email</dt><dd>{company.email}</dd></>)}
          </dl>
        </div>
        <div className="sm:text-right">
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 text-secondary sm:justify-end">
            <dt>Number</dt>
            <dd className="font-medium text-foreground">{invoice.display_number}</dd>
            {date && (<><dt>Date</dt><dd>{formatDate(date)}</dd></>)}
            {invoice.due_date && (<><dt>Due</dt><dd>{formatDate(invoice.due_date)}</dd></>)}
            {invoice.is_issued && invoice.proforma_number && (<><dt>Proforma ref.</dt><dd>{invoice.proforma_number}</dd></>)}
          </dl>
        </div>
      </header>

      <section className="border-b border-line py-6">
        <p className="text-xs tracking-eyebrow text-secondary">Bill to</p>
        <p className="mt-2 font-medium">{client.legal_name || client.business_name}</p>
        {client.billing_address && <p className="whitespace-pre-line text-secondary">{client.billing_address}</p>}
        {client.gst_number && <p className="mt-1 text-secondary">GSTIN <span className="font-medium text-foreground">{client.gst_number}</span></p>}
        <p className="mt-1 text-secondary">Supply type: {invoice.is_interstate ? "Inter-state (IGST)" : "Intra-state (CGST + SGST)"}</p>
      </section>

      <div className="overflow-x-auto py-6">
        <table className="w-full min-w-[480px] text-left">
          <thead>
            <tr className="border-b border-line text-xs tracking-eyebrow text-secondary">
              <th className="py-2 pr-4 font-medium">Description</th>
              <th className="py-2 pr-4 font-medium">SAC</th>
              <th className="py-2 text-right font-medium">Taxable value</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-line/60 align-top">
              <td className="py-3 pr-4">
                <p className="font-medium">{invoice.service_title || "Professional services"}</p>
                {invoice.service_description && invoice.service_description !== invoice.service_title && (
                  <p className="mt-0.5 whitespace-pre-line text-secondary">{invoice.service_description}</p>
                )}
              </td>
              <td className="py-3 pr-4">{invoice.sac_code || "-"}</td>
              <td className="py-3 text-right tabular-nums">{money(invoice.taxable_value)}</td>
            </tr>
          </tbody>
        </table>

        <dl className="ml-auto mt-4 grid max-w-xs grid-cols-[1fr_auto] gap-x-6 gap-y-1.5 tabular-nums">
          <dt className="text-secondary">Taxable value</dt>
          <dd className="text-right">{money(invoice.taxable_value)}</dd>
          {invoice.is_interstate ? (
            <>
              <dt className="text-secondary">IGST @ {invoice.gst_rate}%</dt>
              <dd className="text-right">{money(invoice.igst)}</dd>
            </>
          ) : (
            <>
              <dt className="text-secondary">CGST @ {invoice.gst_rate / 2}%</dt>
              <dd className="text-right">{money(invoice.cgst)}</dd>
              <dt className="text-secondary">SGST @ {invoice.gst_rate / 2}%</dt>
              <dd className="text-right">{money(invoice.sgst)}</dd>
            </>
          )}
          <div className="col-span-2 my-1 border-t border-line" aria-hidden />
          <dt className="font-semibold">Total</dt>
          <dd className="text-right font-semibold">{money(invoice.total_amount)}</dd>
        </dl>
      </div>

      {(company.bank_name || company.bank_account) && (
        <section className="border-t border-line pt-6">
          <p className="text-xs tracking-eyebrow text-secondary">Pay to</p>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 text-secondary">
            {company.bank_name && (<><dt>Bank</dt><dd className="text-foreground">{company.bank_name}</dd></>)}
            {company.bank_account && (<><dt>Account</dt><dd className="text-foreground">{company.bank_account}</dd></>)}
            {company.bank_ifsc && (<><dt>IFSC</dt><dd className="text-foreground">{company.bank_ifsc}</dd></>)}
          </dl>
        </section>
      )}

      {!invoice.is_issued && (
        <p className="mt-6 rounded-xl bg-mist px-4 py-3 text-xs text-secondary">
          This is a proforma invoice, not a tax invoice. A GST tax invoice will be issued once it is approved.
        </p>
      )}
    </article>
  );
}
