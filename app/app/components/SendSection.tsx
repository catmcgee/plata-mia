"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { keccak256, parseUnits, toBytes } from "viem";

import { AssetId } from "../types";
import useStealthVault from "../hooks/useStealthVault";

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
};

const SendSection = ({ onSend, defaultRecipientStealthId }: SendSectionProps) => {
  const [recipientStealthPublicId, setRecipientStealthPublicId] = useState(
    defaultRecipientStealthId ?? ""
  );
  const [assetId, setAssetId] = useState<AssetId>("KSM");
  const [amountInput, setAmountInput] = useState<string>("");
  const [formError, setFormError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { depositStealth, isConfigured, vaultAddress, networkLabel } = useStealthVault();

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
      return `Tx confirmed: ${txHash.slice(0, 6)}…${txHash.slice(-4)}`;
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
      const stealthIdHex = keccak256(
        toBytes(`${recipientStealthPublicId}:${Date.now().toString()}`)
      ) as `0x${string}`;
      const receiverTag = keccak256(toBytes(recipientStealthPublicId)) as `0x${string}`;
      const parsedAmount = parseUnits(amountInput, 18);

      const { hash } = await depositStealth({
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
          <p className="eyebrow">Send</p>
          <h2>Stealth Transfer</h2>
        </div>
        <div className="status-stack">
          {formError && <span className="status-pill danger">{formError}</span>}
          {txStatusMessage && <span className="status-pill success">{txStatusMessage}</span>}
        </div>
      </header>

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
            <option value="KSM">KSM</option>
            <option value="USDT">USDT</option>
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

