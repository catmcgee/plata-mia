import { NextRequest, NextResponse } from "next/server";

import { queryInvoiceStatusViaHyperbridge } from "@/app/lib/hyperbridge";

/**
 * GET /api/hyperbridge/invoice-status
 *
 * Returns invoices[invoiceId].paid from StealthVault on Passet Hub using
 * Hyperbridge storage queries. Meant to be called by "Chain B" apps to confirm
 * that an invoice was paid from stealth.
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const invoiceId = searchParams.get("invoiceId") ?? undefined;

  if (!invoiceId) {
    return NextResponse.json({ error: "Missing invoiceId" }, { status: 400 });
  }

  try {
    const result = await queryInvoiceStatusViaHyperbridge({ invoiceId });

    return NextResponse.json(
      {
        chainId: result.chainId.toString(),
        vaultAddress: result.vaultAddress,
        invoiceId: result.invoiceId,
        slot: result.slot,
        raw: result.raw.toString(),
        paid: result.paid,
      },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}


