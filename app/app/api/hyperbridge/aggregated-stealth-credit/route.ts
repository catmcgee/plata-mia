import { NextRequest, NextResponse } from "next/server";

import { queryAggregatedStealthCreditViaHyperbridge } from "@/app/lib/hyperbridge";

/**
 * GET /api/hyperbridge/aggregated-stealth-credit
 *
 * Aggregated cross-chain credit check: can a user pay `amount` from their total
 * stealth balance across all UTXOs on Passet Hub? Uses Hyperbridge to scan
 * StealthPayment events by receiverTag and aggregate balances.
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const stealthPublicId = searchParams.get("stealthPublicId") ?? undefined;
  const assetId = searchParams.get("assetId") ?? undefined;
  const amountStr = searchParams.get("amount") ?? undefined;

  if (!stealthPublicId || !assetId || !amountStr) {
    return NextResponse.json(
      { error: "Missing stealthPublicId, assetId or amount" },
      { status: 400 }
    );
  }

  try {
    const amount = BigInt(amountStr);
    const result = await queryAggregatedStealthCreditViaHyperbridge({
      stealthPublicId,
      assetId,
      amount,
    });

    return NextResponse.json(
      {
        chainId: result.chainId.toString(),
        vaultAddress: result.vaultAddress,
        stealthId: result.stealthId,
        assetId: result.assetId,
        slot: result.slot,
        raw: result.raw.toString(),
        human: result.human,
        requestedAmount: result.requestedAmount.toString(),
        canPay: result.canPay,
      },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
