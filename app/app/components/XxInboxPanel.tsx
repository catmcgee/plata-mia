"use client";

import { useXxInbox } from "../hooks/useXxInbox";

const formatTime = (value: number) => {
  try {
    return new Date(value).toLocaleTimeString();
  } catch {
    return "";
  }
};

export function XxInboxPanel() {
  const { loading, error, ready, messages, isSending, sendTestMessage, refresh } = useXxInbox();

  return (
    <section className="card section">
      <header className="section-header">
        <div>
          <p className="eyebrow">xx network inbox</p>
          <h3>Private Notifications</h3>
        </div>
      </header>

      {loading && <p className="text-sm text-muted-foreground">Contacting xx proxy…</p>}
      {error && <p className="text-sm text-red-600">Error: {error}</p>}

      {!loading && !error && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="secondary-button text-xs"
              disabled={!ready || isSending}
              onClick={() => void sendTestMessage()}
            >
              {isSending ? "Sending…" : "Send test message via xx"}
            </button>

            <button
              type="button"
              className="secondary-button text-xs"
              onClick={() => void refresh()}
              disabled={!ready}
            >
              Refresh inbox
            </button>
          </div>

          <div className="border rounded p-3 max-h-48 overflow-y-auto space-y-2 text-sm">
            {messages.length === 0 && (
              <p className="text-muted-foreground">No xx messages yet. Send one to test.</p>
            )}

            {messages.map((msg) => (
              <div key={msg.id} className="border-b border-muted last:border-0 pb-2 last:pb-0">
                <div className="text-xs text-muted-foreground">{formatTime(msg.timestamp)}</div>
                <div>{msg.text}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}



