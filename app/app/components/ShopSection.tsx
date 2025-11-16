"use client";

import { FormEvent, useCallback, useMemo, useState } from "react";
import { keccak256, toBytes } from "viem";
import { useAccount, useChainId } from "wagmi";

import useStealthState from "../hooks/useStealthState";
import useStealthVault from "../hooks/useStealthVault";
import { useShopInvoices } from "../hooks/useShopInvoices";
import { NATIVE_ASSET_ID } from "../lib/contracts/stealthVault";
import { notifyInvoicePaid } from "../lib/xxNotify";

const PASSET_CHAIN_ID = 420420422;

type ShopSectionProps = {
  xxUserId?: string | null;
};

const PRODUCT = {
  id: "mate-set",
  name: "Mate Set (Chain B demo)",
  description: "Argentinian mate and bombilla set that only exists on Chain B",
  priceRaw: 1n * 10n ** 17n, // 0.1 PAS
  priceDisplay: "0.1 PAS",
};

export default function ShopSection({ xxUserId }: ShopSectionProps) {
  const { address } = useAccount();
  const chainId = useChainId();
  const {
    address: vaultSigner,
    createInvoice,
    payInvoiceMulti,
    vaultAddress: stealthVaultAddress,
  } = useStealthVault();
  const { profile } = useStealthState();
  const { invoice, setInvoice, creditStatus, setCreditStatus, invoiceStatus, setInvoiceStatus } =
    useShopInvoices();

  const [isCreatingInvoice, setIsCreatingInvoice] = useState(false);
  const [isPaying, setIsPaying] = useState(false);

  const canUsePasset = chainId === PASSET_CHAIN_ID;

  const stealthPublicId = profile?.stealthPublicId ?? "";

  const derivedStealthIdHex = useMemo(() => {
    const base = stealthPublicId || address || "demo-stealth";
    return keccak256(toBytes(base)) as `0x${string}`;
  }, [stealthPublicId, address]);

  const handleCreateInvoice = useCallback(
    async (event: FormEvent<HTMLFormElement> | FormEvent<HTMLButtonElement>) => {
      event.preventDefault();
      if (!canUsePasset) {
        setCreditStatus({
          status: "error",
          error: "Switch to Polkadot Hub TestNet (chainId 420420422) to create invoices.",
        });
        return;
      }

      if (!vaultSigner) {
        setCreditStatus({
          status: "error",
          error: "Connect your wallet to create invoices.",
        });
        return;
      }

      const invoiceId = keccak256(
        toBytes(`${PRODUCT.id}:${Date.now().toString()}:${address ?? ""}`)
      ) as `0x${string}`;

      setIsCreatingInvoice(true);
      setCreditStatus({ status: "idle" });
      setInvoiceStatus({ status: "idle" });

      try {
        await createInvoice({
          invoiceId,
          amount: PRODUCT.priceRaw,
        });

        setInvoice({
          invoiceId,
          productName: PRODUCT.name,
          amount: PRODUCT.priceRaw,
        });

        setCreditStatus({ status: "checking" });

        // Use Hyperbridge aggregated balance API to check all stealth payments with this receiverTag
        const params = new URLSearchParams({
          stealthPublicId: stealthPublicId,
          assetId: NATIVE_ASSET_ID,
          amount: PRODUCT.priceRaw.toString(),
        });

        const response = await fetch(`/api/hyperbridge/aggregated-stealth-credit?${params.toString()}`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data?.error ?? "Credit check failed");
        }

        setCreditStatus({
          status: "ok",
          canPay: Boolean(data.canPay),
          balanceRaw: BigInt(data.raw),
          balanceHuman: data.human ?? data.raw,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to create invoice or check credit.";
        setCreditStatus({ status: "error", error: message });
      } finally {
        setIsCreatingInvoice(false);
      }
    },
    [
      canUsePasset,
      vaultSigner,
      setCreditStatus,
      setInvoiceStatus,
      setInvoice,
      createInvoice,
      derivedStealthIdHex,
      address,
    ]
  );

  const handlePayInvoice = useCallback(async () => {
    console.log("[ShopSection] handlePayInvoice called");
    console.log("[ShopSection] canUsePasset:", canUsePasset);
    console.log("[ShopSection] invoice.invoiceId:", invoice.invoiceId);
    console.log("[ShopSection] stealthVaultAddress:", stealthVaultAddress);
    console.log("[ShopSection] stealthPublicId:", stealthPublicId);

    if (!canUsePasset || !invoice.invoiceId || !stealthVaultAddress) {
      console.log("[ShopSection] Early return - missing requirements");
      return;
    }

    setIsPaying(true);
    let lastTxHash: `0x${string}` | undefined;
    try {
      // Find all stealthIds with balance for this user
      const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL_PASSET ?? "https://testnet-passet-hub-eth-rpc.polkadot.io";

      console.log("[ShopSection] Importing stealthDiscovery...");
      const { findPayableStealthIds } = await import("@/app/lib/stealthDiscovery");

      console.log("[ShopSection] Finding payable UTXOs...");
      const payableUTXOs = await findPayableStealthIds({
        vaultAddress: stealthVaultAddress,
        rpcUrl,
        stealthPublicId,
        amount: invoice.amount,
        assetId: NATIVE_ASSET_ID,
      });

      console.log("[ShopSection] Found UTXOs:", payableUTXOs.length);

      if (payableUTXOs.length === 0) {
        throw new Error("No stealth UTXOs found with sufficient balance");
      }

      const stealthIds = payableUTXOs.map(utxo => utxo.stealthId);
      console.log("[ShopSection] Paying invoice with stealthIds:", stealthIds);

      const { hash } = await payInvoiceMulti({
        stealthIds,
        invoiceId: invoice.invoiceId,
      });
      lastTxHash = hash;

      console.log("[ShopSection] Invoice payment transaction submitted");

      setInvoiceStatus({ status: "checking" });

      // Wait a moment for the transaction to be mined and state to update
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Check invoice status directly from contract first
      const { createPublicClient, http } = await import("viem");
      const { STEALTH_VAULT_ABI } = await import("@/app/lib/contracts/stealthVault");

      const client = createPublicClient({
        transport: http("https://testnet-passet-hub-eth-rpc.polkadot.io"),
      });

      const invoiceData = await client.readContract({
        address: stealthVaultAddress,
        abi: STEALTH_VAULT_ABI,
        functionName: "invoices",
        args: [invoice.invoiceId],
      });

      console.log("[ShopSection] Direct contract invoice data:", invoiceData);
      const isPaidDirect = invoiceData[3]; // paid is the 4th field

      let paid = false;

      if (isPaidDirect) {
        setInvoiceStatus({ status: "paid" });
        paid = true;
      } else {
        // Also try Hyperbridge
        const params = new URLSearchParams({
          invoiceId: invoice.invoiceId,
        });

        const response = await fetch(`/api/hyperbridge/invoice-status?${params.toString()}`);
        const data = await response.json();

        console.log("[ShopSection] Hyperbridge invoice status:", data);

        if (!response.ok) {
          throw new Error(data?.error ?? "Invoice status check failed");
        }

        setInvoiceStatus({
          status: data.paid ? "paid" : "unpaid",
        });
        paid = Boolean(data.paid);
      }

      if (
        paid &&
        xxUserId &&
        invoice.invoiceId &&
        invoice.amount !== null &&
        invoice.amount !== undefined
      ) {
        void notifyInvoicePaid({
          xxUserId,
          stealthId: derivedStealthIdHex,
          asset: "PAS",
          amount: invoice.amount.toString(),
          invoiceId: invoice.invoiceId,
          originChainId: chainId ?? undefined,
          txHash: lastTxHash,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to pay invoice.";
      setInvoiceStatus({ status: "error", error: message });
    } finally {
      setIsPaying(false);
    }
  }, [
    canUsePasset,
    invoice.invoiceId,
    invoice.amount,
    stealthPublicId,
    stealthVaultAddress,
    payInvoiceMulti,
    setInvoiceStatus,
    setIsPaying,
    chainId,
    xxUserId,
    derivedStealthIdHex,
  ]);

  const renderCreditStatus = () => {
    switch (creditStatus.status) {
      case "idle":
        return "No credit check performed yet.";
      case "checking":
        return "Checking stealth balance via Hyperbridge…";
      case "error":
        return `Error: ${creditStatus.error}`;
      case "ok":
        if (creditStatus.canPay) {
          return `✅ You can pay from stealth. Balance: ${creditStatus.balanceHuman ?? creditStatus.balanceRaw.toString()} PAS.`;
        }
        return `❌ Insufficient stealth balance. Balance: ${
          creditStatus.balanceHuman ?? creditStatus.balanceRaw.toString()
        } PAS.`;
      default:
        return null;
    }
  };

  const renderInvoiceStatus = () => {
    switch (invoiceStatus.status) {
      case "idle":
        return "Invoice not paid yet.";
      case "checking":
        return "Checking invoice status via Hyperbridge…";
      case "paid":
        return "✅ Invoice confirmed as PAID via Hyperbridge!";
      case "unpaid":
        return "❌ Invoice still appears unpaid.";
      case "error":
        return `Error: ${invoiceStatus.error}`;
      default:
        return null;
    }
  };

  return (
    <section className="card section">
      <header className="section-header">
        <div>
          <p className="eyebrow">SHOP • CHAIN B DEMO</p>
          <h2>CROSS-CHAIN INVOICE PAYMENTS VIA HYPERBRIDGE</h2>
         
        </div>
      </header>

      <div className="info-snippet">
        <p>
          Create invoice → Hyperbridge checks your aggregated stealth balance → Pay from multiple UTXOs → Hyperbridge confirms payment
        </p>
        <p className="text-xs text-muted-foreground mt-2">
          <strong>Privacy:</strong> Your wallet never touches the payment. Hyperbridge reads contract storage to verify balances
          and payment status. Observer sees stealth IDs used but can't link them to you.
        </p>
      </div>

      {!canUsePasset && (
        <div className="status-pill danger">
          Switch your wallet to Polkadot Hub TestNet (chainId 420420422) to use this checkout flow.
        </div>
      )}

      <div className="card section space-y-4">
        <div>
          <h3 className="text-lg font-semibold">{PRODUCT.name}</h3>
          <p className="text-sm text-muted-foreground">{PRODUCT.description}</p>
          <p className="text-sm mt-1">Price: {PRODUCT.priceDisplay}</p>
        </div>

        <form className="flex flex-col gap-3" onSubmit={handleCreateInvoice}>
          <button
            type="submit"
            className="primary-button"
            disabled={!canUsePasset || isCreatingInvoice}
          >
            {isCreatingInvoice ? "Creating invoice…" : "Create invoice & check stealth credit"}
          </button>
        </form>

        {invoice.invoiceId && (
          <div className="text-sm text-muted-foreground break-all">
            <span className="font-semibold">Invoice ID:</span> {invoice.invoiceId}
          </div>
        )}

        <div className="text-sm">
          <span className="font-semibold">Credit check:</span> {renderCreditStatus()}
        </div>

        <button
          type="button"
          className="secondary-button"
          disabled={
            !canUsePasset ||
            !invoice.invoiceId ||
            creditStatus.status !== "ok" ||
            !creditStatus.canPay ||
            isPaying
          }
          onClick={handlePayInvoice}
        >
          {isPaying ? "Paying invoice…" : "Pay invoice from stealth"}
        </button>

        <div className="text-sm">
          <span className="font-semibold">Invoice status:</span> {renderInvoiceStatus()}
        </div>
      </div>

      <div className="text-xs text-muted-foreground space-y-1">
        <p>
          Stealth ID:{" "}
          {stealthPublicId ? (
            <>
              {stealthPublicId} (
              <span className="mono break-all">{derivedStealthIdHex}</span>
              )
            </>
          ) : (
            "Not set"
          )}
        </p>
      </div>
    </section>
  );
}


