"use client";

export type StealthPaymentNotificationPayload = {
  xxUserId: string;
  stealthId: string;
  asset: string;
  amount: string;
  originChainId?: number;
  txHash?: string;
};

export type InvoicePaidNotificationPayload = {
  xxUserId: string;
  stealthId: string;
  asset: string;
  amount: string;
  invoiceId: string;
  originChainId?: number;
  txHash?: string;
};

const API_BASE_PATH = "/api/xx/notify";

async function postJson(path: string, body: unknown) {
  try {
    const res = await fetch(`${API_BASE_PATH}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      // eslint-disable-next-line no-console
      console.warn(
        `[xxNotify] Request to ${path} failed:`,
        res.status,
        text
      );
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[xxNotify] Error calling ${path}:`, err);
  }
}

export async function notifyStealthPayment(
  payload: StealthPaymentNotificationPayload
) {
  await postJson("/stealth-payment", payload);
}

export async function notifyInvoicePaid(
  payload: InvoicePaidNotificationPayload
) {
  await postJson("/invoice-paid", payload);
}


