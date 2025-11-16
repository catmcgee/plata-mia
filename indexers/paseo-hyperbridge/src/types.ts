import type { Hex } from "viem";

export type StealthBalanceParams = {
  stealthId: Hex;
  assetId: Hex;
};

export type StealthCreditParams = StealthBalanceParams & {
  amount: bigint;
};

export type StealthBalanceResult = {
  chainId: bigint;
  vaultAddress: Hex;
  stealthId: Hex;
  assetId: Hex;
  slot: Hex;
  raw: bigint;
  human: string;
};

export type StealthCreditResult = StealthBalanceResult & {
  requestedAmount: bigint;
  canPay: boolean;
};

export type InvoiceStatusResult = {
  chainId: bigint;
  vaultAddress: Hex;
  invoiceId: Hex;
  slot: Hex;
  raw: bigint;
  paid: boolean;
};

