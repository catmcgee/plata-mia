"use client";

import { useMemo, useState } from "react";
import { parseUnits } from "viem";

import { StealthPayment } from "../types";
import useStealthVault from "../hooks/useStealthVault";

type InboxSectionProps = {
  payments: StealthPayment[];
  onWithdraw: (id: string) => void;
};

const formatDate = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const shorten = (value: string) => {
  if (value.length <= 12) {
    return value;
  }
  return `${value.slice(0, 10)}…`;
};

const InboxSection = ({ payments, onWithdraw }: InboxSectionProps) => {
  const { withdraw, vaultAddress, isConfigured, networkLabel } = useStealthVault();
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);

  const txStatusMessage = useMemo(() => {
    if (isSubmitting && !txHash) {
      return "Submitting withdraw transaction…";
    }
    if (txHash) {
      return `Withdraw confirmed: ${txHash.slice(0, 6)}…${txHash.slice(-4)}`;
    }
    return null;
  }, [isSubmitting, txHash]);

  const handleWithdraw = async (payment: StealthPayment) => {
    setTxError(null);
    setTxHash(null);

    if (!payment.stealthIdHex) {
      setTxError("Missing stealthId for this payment.");
      return;
    }

    if (!vaultAddress || !isConfigured) {
      setTxError(
        `StealthVault address not configured for ${networkLabel ?? "this network"}. ` +
          "Set the NEXT_PUBLIC_STEALTH_VAULT_ADDRESS_* env vars."
      );
      return;
    }

    try {
      setIsSubmitting(true);
      const { hash } = await withdraw({
        stealthId: payment.stealthIdHex,
        amount: parseUnits(payment.amount.toString(), 18),
      });
      setTxHash(hash);
      onWithdraw(payment.id);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to withdraw stealth payment.";
      setTxError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="card section">
      <header className="section-header">
        <div>
          <p className="eyebrow">Inbox / Withdraw</p>
          <h2>Pending & Historical Payments</h2>
        </div>
        <div className="status-stack">
          {txError && <span className="status-pill danger">{txError}</span>}
          {txStatusMessage && <span className="status-pill success">{txStatusMessage}</span>}
        </div>
      </header>

      {payments.length === 0 ? (
        <div className="empty-state">
          <p>No payments yet. Send a stealth transfer to create one.</p>
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="payments-table">
            <thead>
              <tr>
                <th>Direction</th>
                <th>Stealth ID</th>
                <th>Asset</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Created</th>
                <th aria-label="Actions"></th>
              </tr>
            </thead>
            <tbody>
              {payments.map((payment) => (
                <tr key={payment.id}>
                  <td>
                    <span className={`badge ${payment.direction}`}>
                      {payment.direction === "incoming" ? "Incoming" : "Outgoing"}
                    </span>
                  </td>
                  <td className="mono">{shorten(payment.stealthId)}</td>
                  <td>{payment.assetId}</td>
                  <td>{payment.amount.toFixed(2)}</td>
                  <td>
                    <span className={`badge status-${payment.status}`}>
                      {payment.status === "unread" ? "Unread" : "Withdrawn"}
                    </span>
                  </td>
                  <td>{formatDate(payment.createdAt)}</td>
                  <td>
                    {payment.direction === "incoming" && payment.status === "unread" && (
                      <button
                        type="button"
                        className="link-button"
                        onClick={() => handleWithdraw(payment)}
                        disabled={isSubmitting}
                      >
                        {isSubmitting ? "Processing…" : "Withdraw"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};

export default InboxSection;

