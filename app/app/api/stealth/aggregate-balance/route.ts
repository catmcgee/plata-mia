import { NextRequest, NextResponse } from "next/server";
import { getAggregatedBalance } from "@/app/lib/stealthDiscovery";

/**
 * GET /api/stealth/aggregate-balance
 *
 * Returns the total balance across all stealth payments for a given user
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const stealthPublicId = searchParams.get("stealthPublicId");
  const assetId = searchParams.get("assetId") ?? undefined;

  if (!stealthPublicId) {
    return NextResponse.json(
      { error: "Missing stealthPublicId parameter" },
      { status: 400 }
    );
  }

  const vaultAddress = process.env.NEXT_PUBLIC_STEALTH_VAULT_ADDRESS_PASSET as `0x${string}`;
  const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL_PASSET ?? "https://testnet-passet-hub-eth-rpc.polkadot.io";

  if (!vaultAddress) {
    return NextResponse.json(
      { error: "Vault address not configured" },
      { status: 500 }
    );
  }

  try {
    const totalBalance = await getAggregatedBalance({
      vaultAddress,
      rpcUrl,
      stealthPublicId,
      assetId: assetId as `0x${string}` | undefined,
    });

    return NextResponse.json({
      stealthPublicId,
      assetId,
      totalBalance: totalBalance.toString(),
      canPay: (amount: string) => totalBalance >= BigInt(amount),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
