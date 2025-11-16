"use client";

import { Dispatch, SetStateAction, useState } from "react";

export type ShopInvoice = {
  invoiceId: `0x${string}` | null;
  productName: string | null;
  amount: bigint | null;
};

export type CreditStatus =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "ok"; canPay: boolean; balanceRaw: bigint; balanceHuman: string }
  | { status: "error"; error: string };

export type InvoiceStatus =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "paid" }
  | { status: "unpaid" }
  | { status: "error"; error: string };

export type UseShopInvoicesResult = {
  invoice: ShopInvoice;
  setInvoice: Dispatch<SetStateAction<ShopInvoice>>;
  creditStatus: CreditStatus;
  setCreditStatus: Dispatch<SetStateAction<CreditStatus>>;
  invoiceStatus: InvoiceStatus;
  setInvoiceStatus: Dispatch<SetStateAction<InvoiceStatus>>;
};

export function useShopInvoices(): UseShopInvoicesResult {
  const [invoice, setInvoice] = useState<ShopInvoice>({
    invoiceId: null,
    productName: null,
    amount: null,
  });

  const [creditStatus, setCreditStatus] = useState<CreditStatus>({ status: "idle" });
  const [invoiceStatus, setInvoiceStatus] = useState<InvoiceStatus>({ status: "idle" });

  return {
    invoice,
    setInvoice,
    creditStatus,
    setCreditStatus,
    invoiceStatus,
    setInvoiceStatus,
  };
}


