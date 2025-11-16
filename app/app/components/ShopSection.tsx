"use client";

import { FormEvent, useCallback, useMemo, useState } from "react";
import { keccak256, toBytes } from "viem";
import { useAccount, useChainId } from "wagmi";

import useStealthState from "../hooks/useStealthState";
import useStealthVault from "../hooks/useStealthVault";
import { useShopInvoices } from "../hooks/useShopInvoices";
import { NATIVE_ASSET_ID } from "../lib/contracts/stealthVault";

const PASSET_CHAIN_ID = 420420422;

const PRODUCT = {
  id: "glitchy-hoodie",
  name: "Glitchy Hoodie (Chain B demo)",
  description: "A limited-edition hoodie that only exists on Chain B.",
  priceRaw: 1n * 10n ** 17n, // 0.1 PAS
  priceDisplay: "0.1 PAS",
};

export default function ShopSection() {
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

      await payInvoiceMulti({
        stealthIds,
        invoiceId: invoice.invoiceId,
      });

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

      if (isPaidDirect) {
        setInvoiceStatus({ status: "paid" });
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
          <h2>PAY MERCHANT INVOICES USING STEALTH BALANCES</h2>
          <p className="text-sm text-muted-foreground">
            This simulates a dapp on another chain (“Chain B”). It creates an invoice on Passet Hub,
            checks your stealth balance via Hyperbridge, lets you pay from stealth, then verifies the
            invoice via Hyperbridge again.
          </p>
        </div>
      </header>

      <div className="info-snippet">
        <p>
          <strong>What to do:</strong> Spin up an invoice, run a Hyperbridge credit check, then pay it
          directly from your stealth balances when greenlit.
        </p>
        <p>
          <strong>What happens:</strong> Clicking “Create invoice” calls <code>StealthVault.createInvoice</code>,
          which writes a struct <code>{`{ merchant, assetId, amount, paid=false }`}</code> into the on-chain
          `invoices` mapping. Hyperbridge later queries that slot (mapping base slot 1) to prove the invoice exists
          on Polkadot Hub without exposing your wallet.
        </p>
        <p>
          <strong>Under the hood:</strong> Paying invokes <code>payInvoiceMulti</code>, which walks each stealth UTXO
          you discovered, subtracts the PAS balance, and wires the total straight to the merchant. The contract flips
          the `paid` flag and emits `InvoicePaid`, and Hyperbridge re-reads the storage offset (slot 1 + 3) to confirm the
          settlement. Because funds never detour through your public address, only the vault and Hyperbridge proofs tie the
          invoice to your stealth IDs—grab the invoice ID plus tx hash if you ever need to validate it on-chain.
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

        <div className="info-snippet">
          <p>
            <strong>Hyperbridge credit math:</strong> Our indexer replays the exact storage math from
            <code>hyperbridge.ts</code>—it hashes your stealth ID with mapping base slot 0 (since the ERC20 address is
            immutable) and then the PAS asset ID to read <code>balances[stealthId][NATIVE_ASSET_ID]</code>. Those proofs
            stay detached from your wallet address; only the hashed receiver tags that Hyperbridge already knows are
            involved.
          </p>
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

        <div className="info-snippet">
          <p>
            <strong>Invoice proof path:</strong> After <code>payInvoiceMulti</code> finishes, the contract emits
            <code>InvoicePaid</code> and sets <code>invoices[invoiceId].paid = true</code>. Hyperbridge checks the paid
            flag by reading storage slot <code>keccak(invoiceId, 1) + 3</code> (the boolean offset within the struct),
            so any chain can independently verify the settlement without ever seeing which stealth IDs supplied the PAS.
          </p>
        </div>
      </div>

      <div className="text-xs text-muted-foreground space-y-1">
        <p>
          Stealth ID (derived):{" "}
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
        <p>
          Demo note: we derive a bytes32 stealthId from your profile’s stealth public ID (or wallet
          address) via keccak256. Production would use a true stealth public key.
        </p>
      </div>
    </section>
  );
}


