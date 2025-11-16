"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { keccak256, parseUnits, toBytes } from "viem";
import { useChainId } from "wagmi";

import { AssetId } from "../types";
import useStealthVault from "../hooks/useStealthVault";
import { notifyStealthPayment } from "../lib/xxNotify";

type SendFormSubmission = {
  stealthId: string;
  stealthIdHex: `0x${string}`;
  assetId: AssetId;
  amount: number;
  direction?: "incoming" | "outgoing";
  txHash?: `0x${string}`;
};

type SendSectionProps = {
  onSend: (input: SendFormSubmission) => void;
  defaultRecipientStealthId?: string;
  xxUserId?: string | null;
};

const SendSection = ({ onSend, defaultRecipientStealthId, xxUserId }: SendSectionProps) => {
  const [recipientStealthPublicId, setRecipientStealthPublicId] = useState(
    defaultRecipientStealthId ?? ""
  );
  const [assetId, setAssetId] = useState<AssetId>("PAS");
  const [amountInput, setAmountInput] = useState<string>("");
  const [formError, setFormError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { depositStealthNative, isConfigured, vaultAddress, networkLabel } = useStealthVault();
  const chainId = useChainId();

  useEffect(() => {
    if (defaultRecipientStealthId !== undefined) {
      setRecipientStealthPublicId(defaultRecipientStealthId);
    }
  }, [defaultRecipientStealthId]);

  const txStatusMessage = useMemo(() => {
    if (isSubmitting && !txHash) {
      return "Submitting transaction…";
    }
    if (txHash) {
      return `Tx confirmed: ${txHash}`;
    }
    return null;
  }, [isSubmitting, txHash]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    setTxHash(null);

    const numericAmount = Number(amountInput);

    if (!recipientStealthPublicId || numericAmount <= 0 || Number.isNaN(numericAmount)) {
      setFormError("Enter a recipient stealth public ID and an amount greater than 0.");
      return;
    }

    if (!vaultAddress || !isConfigured) {
      setFormError(
        `StealthVault address not configured for ${networkLabel ?? "this network"}. ` +
          "Set the NEXT_PUBLIC_STEALTH_VAULT_ADDRESS_* env vars."
      );
      return;
    }

    try {
      setIsSubmitting(true);
      // Create unique stealthId for this payment (privacy)
      const ephemeralData = `${recipientStealthPublicId}:${Date.now().toString()}:${Math.random().toString()}`;
      const stealthIdHex = keccak256(toBytes(ephemeralData)) as `0x${string}`;
      // ReceiverTag allows recipient to discover all their payments
      const receiverTag = keccak256(toBytes(recipientStealthPublicId)) as `0x${string}`;
      const parsedAmount = parseUnits(amountInput, 18);

      const { hash } = await depositStealthNative({
        stealthId: stealthIdHex,
        amount: parsedAmount,
        receiverTag,
      });

      setTxHash(hash);
      setRecipientStealthPublicId("");
      setAmountInput("");

    onSend({
        stealthId: recipientStealthPublicId,
        stealthIdHex,
      assetId,
      amount: numericAmount,
        direction: "incoming",
        txHash: hash,
      });

      if (xxUserId) {
        void notifyStealthPayment({
          xxUserId,
          stealthId: stealthIdHex,
          asset: "PAS",
          amount: parsedAmount.toString(),
          originChainId: chainId ?? undefined,
          txHash: hash,
        });
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to submit stealth payment transaction.";
      setFormError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="card section">
      <header className="section-header">
        <div>
          <p className="eyebrow">SEND</p>
          <h2>STEALTH TRANSFER</h2>
        </div>
        <div className="status-stack">
          {formError && <span className="status-pill danger">{formError}</span>}
          {txStatusMessage && <span className="status-pill success">{txStatusMessage}</span>}
        </div>
      </header>

      <div className="info-snippet">
        <p>
          <strong>What to do:</strong> Enter the recipient’s stealth ID and how much PAS you want to send them. Try sending it to yourself for now!
        </p>
        <p>
          <strong>What happens:</strong> Each submission creates a brand-new stealth ID plus receiver tag
          on Polkadot Hub, so no one can correlate transfers. 
        </p>
      </div>

      <form className="form-grid" onSubmit={handleSubmit}>
        <label className="input-control">
          <span>Recipient Stealth Public ID</span>
          <input
            type="text"
            value={recipientStealthPublicId}
            onChange={(event) => setRecipientStealthPublicId(event.target.value)}
            placeholder="stealth-recipient-xyz"
          />
        </label>

        <label className="input-control">
          <span>Asset</span>
          <select value={assetId} onChange={(event) => setAssetId(event.target.value as AssetId)}>
            <option value="PAS">PAS (Native)</option>
          </select>
        </label>

        <label className="input-control">
          <span>Amount</span>
          <input
            type="number"
            min={0}
            step="0.0001"
            value={amountInput}
            onChange={(event) => setAmountInput(event.target.value)}
            placeholder="0.00"
          />
        </label>

        <div className="actions-row">
          <button type="submit" className="primary-button" disabled={isSubmitting}>
            {isSubmitting ? "Sending…" : "Send Stealth Payment"}
          </button>
        </div>
      </form>
    </section>
  );
};

export default SendSection;

