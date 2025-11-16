"use client";

import { useCallback, useEffect, useState } from "react";

export type XxInboxMessage = {
  id: string;
  text: string;
  timestamp: number;
  sender?: string;
};

const POLL_INTERVAL_MS = 5000;

export function useXxInbox() {
  const [messages, setMessages] = useState<XxInboxMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  const fetchMessages = useCallback(async () => {
    try {
      const response = await fetch("/api/xx/inbox", {
        cache: "no-store",
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error ?? `Proxy responded with ${response.status}`);
      }
      const payload = (await response.json()) as { messages: XxInboxMessage[] } | XxInboxMessage[];
      const list = Array.isArray(payload) ? payload : payload.messages;
      const normalized =
        list?.map((msg) => ({
          ...msg,
          timestamp:
            typeof msg.timestamp === "string"
              ? Date.parse(msg.timestamp)
              : msg.timestamp ?? Date.now(),
        })) ?? [];
      setMessages(normalized);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load xx inbox";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const loop = async () => {
      await fetchMessages();
      if (cancelled) {
        return;
      }
      timer = setTimeout(loop, POLL_INTERVAL_MS);
    };

    void loop();

    return () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [fetchMessages]);

  const sendTestMessage = useCallback(async () => {
    setIsSending(true);
    try {
      const response = await fetch("/api/xx/send-test", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error ?? `Proxy responded with ${response.status}`);
      }
      await fetchMessages();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to send via xx proxy";
      setError(message);
    } finally {
      setIsSending(false);
    }
  }, [fetchMessages]);

  return {
    loading,
    error,
    ready: !loading && !error,
    messages,
    isSending,
    sendTestMessage,
    refresh: fetchMessages,
  };
}


