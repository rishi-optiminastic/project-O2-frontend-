import type { ReactNode } from "react";
import type { InvoiceDocumentView } from "@/lib/api";
import { formatDate, formatINR, cn } from "@/lib/utils";

const RUPEES = { minimumFractionDigits: 2, maximumFractionDigits: 2 };
// Blank ruled space under the services; each extra line uses some of it so the page stays one A4 sheet.
const SERVICES_SPACE_PX = 120;
const LINE_HEIGHT_PX = 32;
const MIN_SPACE_PX = 16;
const money = (v: number) => formatINR(v, RUPEES);

/** Ruled cell of the invoice grid. `open` drops the bottom rule so line items flow down one column. */
function Td({ children, className, open, ...rest }: React.TdHTMLAttributes<HTMLTableCellElement> & { open?: boolean }) {
  return (
    <td className={cn("border-x border-black px-1.5 align-top", !open && "border-y", className)} {...rest}>
      {children}
    </td>
  );
}

/** One amount line under the services (Total, Discount, taxes): label, optional rate, amount. */
function SummaryLine({ label, rate, amount, className }: { label: string; rate?: string; amount: string; className?: string }) {
  return (
    <tr className={cn("font-bold", className)}>
      <Td open className="pt-2">{label}</Td>
      <Td open />
      <Td open />
      <Td open />
      <Td open className="pt-2 text-center">{rate}</Td>
      <Td open className="pt-2 text-center tabular-nums">{amount}</Td>
    </tr>
  );
}

/** Empty ruled space that keeps the vertical column lines running, as on the paper template. */
function Spacer({ height }: { height: string }) {
  return (
    <tr aria-hidden style={{ height }}>
      {Array.from({ length: 6 }, (_, i) => <Td key={i} open />)}
    </tr>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <span className="font-bold">{children}</span>;
}

/**
 * Optiminastic's proforma / GST tax invoice, laid out like the company's paper template:
 * branded header, ruled grid, bank note, stamp and signature, branded footer.
 */
export function InvoiceDocument({ view }: { view: InvoiceDocumentView }) {
  const { invoice, client, company, place_of_supply, amount_in_words } = view;
  const title = invoice.is_issued ? "TAX INVOICE" : "PROFORMA INVOICE";
  const date = invoice.is_issued ? invoice.invoice_date : invoice.proforma_date;
  const halfRate = `${invoice.gst_rate / 2}%`;

  return (
    <div className="overflow-x-auto print:overflow-visible">
      <article className="invoice-sheet mx-auto flex min-w-[760px] max-w-[210mm] flex-col bg-white font-[Arial,Helvetica,sans-serif] text-[11px] leading-snug text-black shadow-sm print:min-w-0 print:shadow-none">
        {/* eslint-disable-next-line @next/next/no-img-element -- static brand artwork; must print */}
        <img src="/invoice/header.png" alt="Optiminastic" className="w-full" />

        <table className="mx-auto w-[92%] table-fixed border-collapse border border-black">
          <colgroup>
            <col className="w-[26%]" />
            <col className="w-[13%]" />
            <col className="w-[11%]" />
            <col className="w-[7%]" />
            <col className="w-[15%]" />
            <col className="w-[16%]" />
          </colgroup>
          <tbody>
            <tr>
              <Td colSpan={6} className="text-center text-[12px] font-bold">{title}</Td>
            </tr>
            <tr>
              <Td colSpan={6} className="py-1 text-center">
                <p className="text-[19px] font-bold leading-tight">{company.legal_name || "Supplier details not configured"}</p>
                <p className="mx-auto mt-0.5 max-w-[80%] text-[9.5px] font-bold">{company.address}</p>
                {company.gstin && <p className="text-[9.5px] font-bold">GSTIN No {company.gstin}</p>}
              </Td>
            </tr>

            {/* Parties, number and date */}
            <tr>
              <Td className="pt-1.5">
                <Label>Bill to</Label>
                <p className="mt-1 font-bold">{client.legal_name || client.business_name}</p>
              </Td>
              <Td colSpan={3} className="p-0">
                <p className="border-b border-black px-1.5 py-1.5"><Label>Tax under Reverse Charge - No</Label></p>
                <p className="px-1.5 py-1.5">
                  <Label>Company Address;</Label>
                  {client.billing_address && <span className="mt-0.5 block whitespace-pre-line">{client.billing_address}</span>}
                </p>
              </Td>
              <Td className="text-center align-middle"><Label>{invoice.is_issued ? "INVOICE No" : "PROFORMA No"}</Label></Td>
              <Td className="text-center align-middle"><Label>Dated</Label></Td>
            </tr>
            <tr>
              <Td className="p-0">
                <p className="px-1.5 py-1.5"><Label>GSTIN No:</Label> {client.gst_number}</p>
                <p className="border-t border-black px-1.5 py-0.5">
                  <Label>Place of Supply :- {place_of_supply ?? ""}</Label>
                </p>
              </Td>
              <Td colSpan={3} className="py-1.5">
                {invoice.due_date && <p><Label>Due date:</Label> {formatDate(invoice.due_date)}</p>}
                {invoice.is_issued && invoice.proforma_number && <p><Label>Proforma ref:</Label> {invoice.proforma_number}</p>}
                {invoice.is_issued && invoice.due_date && (
                  <p className="mt-1"><Label>Remark:</Label> Full payment to be cleared by {formatDate(invoice.due_date)}.</p>
                )}
              </Td>
              <Td className="text-center align-middle font-bold">{invoice.display_number}</Td>
              <Td className="text-center align-middle font-bold">{date ? formatDate(date) : ""}</Td>
            </tr>

            {/* Services */}
            <tr className="text-center font-bold">
              <Td className="py-1">Description of Services</Td>
              <Td className="py-1">SAC CODE</Td>
              <Td className="py-1">Quantity</Td>
              <Td className="py-1" />
              <Td className="py-1">RATE</Td>
              <Td className="py-1">Amount</Td>
            </tr>
            {invoice.lines.map((line, i) => (
              <tr key={`${line.service_id}-${i}`}>
                <Td open className="pt-2">
                  <p className="font-bold">{line.service_title}</p>
                  {line.description && line.description !== line.service_title && (
                    <p className="mt-0.5 whitespace-pre-line">{line.description}</p>
                  )}
                </Td>
                <Td open className="pt-2 text-center">{line.sac_code}</Td>
                <Td open className="pt-2 text-center">1</Td>
                <Td open />
                <Td open className="pt-2 text-center tabular-nums">{money(line.taxable_value)}</Td>
                <Td open className="pt-2 text-center tabular-nums">{money(line.taxable_value)}</Td>
              </tr>
            ))}
            <Spacer height={`${Math.max(SERVICES_SPACE_PX - LINE_HEIGHT_PX * (invoice.lines.length - 1), MIN_SPACE_PX)}px`} />

            <SummaryLine label="Total" amount={money(invoice.taxable_value)} />
            <SummaryLine label="Discount" amount={money(0)} />
            <SummaryLine label="Taxable Value" amount={money(invoice.taxable_value)} />
            {invoice.is_interstate ? (
              <SummaryLine label="ADD IGST" rate={`${invoice.gst_rate}%`} amount={money(invoice.igst)} className="[&>td]:pt-3" />
            ) : (
              <>
                <SummaryLine label="ADD CGST" rate={halfRate} amount={money(invoice.cgst)} className="[&>td]:pt-3" />
                <SummaryLine label="ADD SGST" rate={halfRate} amount={money(invoice.sgst)} className="[&>td]:pt-0" />
              </>
            )}
            <Spacer height="90px" />

            <tr className="font-bold">
              <Td colSpan={5} className="border-y-2 text-[10px]">Total</Td>
              <Td className="border-y-2 text-center text-[12px] tabular-nums">{money(invoice.total_amount)}</Td>
            </tr>

            {/* Words, bank note, stamp and signature */}
            <tr>
              <Td className="py-1">
                <p>Amount Chargeable (in words)</p>
                <p className="font-bold">Rupees: {amount_in_words}</p>
                <div className="mt-6 text-[9.5px] font-bold italic leading-tight">
                  <p>Note- Account Holder Name</p>
                  <p>&quot;{company.legal_name}&quot;</p>
                  {company.bank_account && <p>Account No: {company.bank_account}</p>}
                  {company.bank_ifsc && <p>IFSC : {company.bank_ifsc}</p>}
                  {company.bank_name && <p>Bank Name: {company.bank_name}</p>}
                  {company.bank_branch && <p>Branch Address: {company.bank_branch}</p>}
                </div>
              </Td>
              <Td />
              <Td colSpan={2} className="align-middle">
                {/* eslint-disable-next-line @next/next/no-img-element -- company seal; must print */}
                <img src="/invoice/stamp.png" alt="Company seal" className="mx-auto w-[86px]" />
              </Td>
              <Td colSpan={2} className="relative text-center">
                <p className="pt-2 text-[9.5px] font-bold">For {company.legal_name}</p>
                {/* eslint-disable-next-line @next/next/no-img-element -- authorised signature; must print */}
                <img src="/invoice/signature.png" alt="Authorised signature" className="mx-auto my-1 w-[110px]" />
                <p className="pb-1">Authorised Signatory</p>
              </Td>
            </tr>
            <tr>
              <Td colSpan={4} className="py-0.5 text-center text-[9.5px] italic">
                Note - If the amount is not received by the end of the month, then the invoice will not be furnished
                under GST. The same will be furnished in the month amount is received.
              </Td>
              <Td />
              <Td />
            </tr>
          </tbody>
        </table>

        {!invoice.is_issued && (
          <p className="mx-auto mt-2 w-[92%] text-center text-[10px] italic">
            This is a proforma invoice, not a tax invoice. A GST tax invoice will be issued once it is approved.
          </p>
        )}

        {/* eslint-disable-next-line @next/next/no-img-element -- static brand artwork; must print */}
        <img src="/invoice/footer.png" alt="Optiminastic: info@optiminastic.com, www.optiminastic.com, +91 7710822162" className="mt-auto w-full pt-2" />
      </article>
    </div>
  );
}
