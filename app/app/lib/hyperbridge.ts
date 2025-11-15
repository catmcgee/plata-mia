import { createClient, StorageQueryType } from "@hyperbridge/sdk";
import {
  Hex,
  encodeAbiParameters,
  hexToBigInt,
  hexToBytes,
  keccak256,
  numberToHex,
  parseAbiParameters,
} from "viem";

/**
 * Hyperbridge storage helpers allow us to inspect StealthVault balances and invoices
 * on an EVM chain (e.g. Passet Hub) from any other environment. Future work can reuse
 * the Polkadot-SDK pallets (pallet-ismp, pallet-hyperbridge, pallet-token-gateway, etc.)
 * described in:
 *
 *   https://docs.hyperbridge.network/developers/polkadot/getting-started
 *   https://docs.hyperbridge.network/developers/evm/getting-started
 */

const encoder = parseAbiParameters("bytes32, uint256");
const BALANCES_BASE_SLOT = 1n;
const INVOICES_BASE_SLOT = 2n;
const INVOICE_PAID_OFFSET = 3n;

const DEFAULT_CHAIN_ID = BigInt(process.env.HYPERBRIDGE_CHAIN_ID ?? "420420422");

type HyperbridgeConfig = {
  chainId: bigint;
  indexerUrl: string;
  vaultAddress: Hex;
};

function getHyperbridgeConfig(): HyperbridgeConfig {
  const indexerUrl = process.env.HYPERBRIDGE_INDEXER_URL;
  const vaultAddress = process.env.STEALTH_VAULT_ADDRESS_PASSET as Hex | undefined;

  if (!indexerUrl) {
    throw new Error("Missing HYPERBRIDGE_INDEXER_URL env var.");
  }

  if (!vaultAddress) {
    throw new Error("Missing STEALTH_VAULT_ADDRESS_PASSET env var.");
  }

  return {
    chainId: DEFAULT_CHAIN_ID,
    indexerUrl,
    vaultAddress,
  };
}

function assertHex32(value: string, label: string): Hex {
  if (!value || !value.startsWith("0x")) {
    throw new Error(`${label} must be a 0x-prefixed hex string`);
  }
  if (hexToBytes(value as Hex).length !== 32) {
    throw new Error(`${label} must be 32 bytes`);
  }
  return value as Hex;
}

function encodeMappingSlot(key: Hex, slot: bigint): Hex {
  return keccak256(encodeAbiParameters(encoder, [key, slot]));
}

function computeBalancesSlot(stealthId: Hex, assetId: Hex): Hex {
  const outerSlot = encodeMappingSlot(stealthId, BALANCES_BASE_SLOT);
  const innerSlot = encodeMappingSlot(assetId, hexToBigInt(outerSlot));
  return innerSlot;
}

function computeInvoiceStructSlot(invoiceId: Hex): Hex {
  return encodeMappingSlot(invoiceId, INVOICES_BASE_SLOT);
}

function addSlotOffset(slot: Hex, offset: bigint): Hex {
  const base = hexToBigInt(slot);
  return numberToHex(base + offset, { size: 32 }) as Hex;
}

function createHyperbridgeClient(baseUrl: string) {
  return createClient({ baseUrl });
}

export type StealthBalanceResult = {
  chainId: bigint;
  vaultAddress: Hex;
  stealthId: Hex;
  assetId: Hex;
  slot: Hex;
  raw: bigint;
  human: string;
};

export async function queryStealthBalanceViaHyperbridge(params: {
  stealthId: string;
  assetId: string;
}): Promise<StealthBalanceResult> {
  const stealthHex = assertHex32(params.stealthId, "stealthId");
  const assetHex = assertHex32(params.assetId, "assetId");

  const { chainId, indexerUrl, vaultAddress } = getHyperbridgeConfig();
  const client = createHyperbridgeClient(indexerUrl);

  const slot = computeBalancesSlot(stealthHex, assetHex);

  const response = await client.storage.query({
    type: StorageQueryType.Get,
    chainId,
    contract: vaultAddress,
    key: slot,
  });

  const rawValue = response?.value ?? "0x0";
  const raw = hexToBigInt(rawValue);

  return {
    chainId,
    vaultAddress,
    stealthId: stealthHex,
    assetId: assetHex,
    slot,
    raw,
    human: raw.toString(),
  };
}

export type StealthCreditResult = StealthBalanceResult & {
  requestedAmount: bigint;
  canPay: boolean;
};

export async function queryStealthCreditViaHyperbridge(params: {
  stealthId: string;
  assetId: string;
  amount: bigint;
}): Promise<StealthCreditResult> {
  const balance = await queryStealthBalanceViaHyperbridge({
    stealthId: params.stealthId,
    assetId: params.assetId,
  });

  const canPay = balance.raw >= params.amount;

  return {
    ...balance,
    requestedAmount: params.amount,
    canPay,
  };
}

export type InvoiceStatusResult = {
  chainId: bigint;
  vaultAddress: Hex;
  invoiceId: Hex;
  paid: boolean;
  slot: Hex;
  raw: bigint;
};

export async function queryInvoiceStatusViaHyperbridge(params: {
  invoiceId: string;
}): Promise<InvoiceStatusResult> {
  const invoiceHex = assertHex32(params.invoiceId, "invoiceId");

  const { chainId, indexerUrl, vaultAddress } = getHyperbridgeConfig();
  const client = createHyperbridgeClient(indexerUrl);

  const structSlot = computeInvoiceStructSlot(invoiceHex);
  const paidSlot = addSlotOffset(structSlot, INVOICE_PAID_OFFSET);

  const response = await client.storage.query({
    type: StorageQueryType.Get,
    chainId,
    contract: vaultAddress,
    key: paidSlot,
  });

  const rawValue = response?.value ?? "0x0";
  const raw = hexToBigInt(rawValue);
  const paid = raw !== 0n;

  return {
    chainId,
    vaultAddress,
    invoiceId: invoiceHex,
    slot: paidSlot,
    raw,
    paid,
  };
}


