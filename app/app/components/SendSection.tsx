'use client';

import { FormEvent, useState } from "react";
import { AssetId } from "../types";

type SendSectionProps = {
  onSend: (input: {
    recipientStealthPublicId: string;
    assetId: AssetId;
    amount: number;
  }) => void;
};

const SendSection = ({ onSend }: SendSectionProps) => {
  const [recipientStealthPublicId, setRecipientStealthPublicId] = useState("");
  const [assetId, setAssetId] = useState<AssetId>("KSM");
  const [amountInput, setAmountInput] = useState<string>("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const numericAmount = Number(amountInput);

    if (!recipientStealthPublicId || numericAmount <= 0 || Number.isNaN(numericAmount)) {
      setStatusMessage("Enter a recipient and amount greater than 0.");
      return;
    }

    onSend({
      recipientStealthPublicId,
      assetId,
      amount: numericAmount,
    });

    setRecipientStealthPublicId("");
    setAmountInput("");
    setStatusMessage("Stealth payment simulated.");
  };

  return (
    <section className="card section">
      <header className="section-header">
        <div>
          <p className="eyebrow">Send</p>
          <h2>Simulated Stealth Transfer</h2>
        </div>
        {statusMessage && <span className="status-pill neutral">{statusMessage}</span>}
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
            step="0.01"
            value={amountInput}
            onChange={(event) => setAmountInput(event.target.value)}
            placeholder="0.00"
          />
        </label>

        <div className="actions-row">
          <button type="submit" className="primary-button">
            Send Stealth Payment (Simulated)
          </button>
        </div>
      </form>
    </section>
  );
};

export default SendSection;

