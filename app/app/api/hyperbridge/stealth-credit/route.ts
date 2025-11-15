import { NextRequest, NextResponse } from "next/server";

import { queryStealthCreditViaHyperbridge } from "@/app/lib/hyperbridge";

/**
 * GET /api/hyperbridge/stealth-credit
 *
 * Cross-chain credit check: can a user pay `amount` from their stealth balance
 * on Passet Hub? Uses Hyperbridge storage queries instead of direct RPC.
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const stealthId = searchParams.get("stealthId") ?? undefined;
  const assetId = searchParams.get("assetId") ?? undefined;
  const amountStr = searchParams.get("amount") ?? undefined;

  if (!stealthId || !assetId || !amountStr) {
    return NextResponse.json(
      { error: "Missing stealthId, assetId or amount" },
      { status: 400 }
    );
  }

  try {
    const amount = BigInt(amountStr);
    const result = await queryStealthCreditViaHyperbridge({
      stealthId,
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


