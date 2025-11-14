'use client';

import { StealthPayment } from "../types";

type InboxSectionProps = {
  payments: StealthPayment[];
  onWithdraw: (id: string) => void;
  onSimulateIncoming: () => void;
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

const InboxSection = ({
  payments,
  onWithdraw,
  onSimulateIncoming,
}: InboxSectionProps) => {
  return (
    <section className="card section">
      <header className="section-header">
        <div>
          <p className="eyebrow">Inbox / Withdraw</p>
          <h2>Pending & Historical Payments</h2>
        </div>
        <button type="button" className="secondary-button" onClick={onSimulateIncoming}>
          Simulate Incoming Stealth Payment
        </button>
      </header>

      {payments.length === 0 ? (
        <div className="empty-state">
          <p>No payments yet. Simulate one to test the flow.</p>
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
                        onClick={() => onWithdraw(payment.id)}
                      >
                        Withdraw
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

