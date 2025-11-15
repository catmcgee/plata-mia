export type StealthProfile = {
  stealthPublicId: string;
  xxIdentity: string;
};

export type AssetId = string;

export type StealthPaymentStatus = "unread" | "withdrawn";

export type StealthPayment = {
  id: string;
  stealthId: string;
  stealthIdHex?: `0x${string}`;
  assetId: AssetId;
  amount: number;
  direction: "incoming" | "outgoing";
  createdAt: string;
  status: StealthPaymentStatus;
  txHash?: `0x${string}`;
};

