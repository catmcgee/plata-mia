import {
  Hex,
  createPublicClient,
  encodeAbiParameters,
  hexToBigInt,
  hexToBytes,
  http,
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
// IMPORTANT: token is immutable, so it doesn't occupy a storage slot
// Therefore balances is at slot 0, not slot 1
const BALANCES_BASE_SLOT = 0n;
const INVOICES_BASE_SLOT = 1n;
const INVOICE_PAID_OFFSET = 3n;

const DEFAULT_CHAIN_ID = BigInt(process.env.HYPERBRIDGE_CHAIN_ID ?? "420420422");
const DEFAULT_RPC_URL =
  process.env.HYPERBRIDGE_RPC_URL ?? "https://testnet-passet-hub-eth-rpc.polkadot.io";
const INDEXER_BASE_URL = process.env.HYPERBRIDGE_INDEXER_URL?.replace(/\/$/, "");
const INDEXER_TIMEOUT_MS = Number(process.env.HYPERBRIDGE_INDEXER_TIMEOUT_MS ?? "7000");

type HyperbridgeConfig = {
  chainId: bigint;
  rpcUrl: string;
  vaultAddress: Hex;
};

let hyperbridgeConfig: HyperbridgeConfig | undefined;
let hyperbridgeClient:
  | ReturnType<typeof createPublicClient<{ chain: undefined; transport: ReturnType<typeof http> }>>
  | undefined;

function getHyperbridgeContext(): HyperbridgeConfig {
  if (hyperbridgeConfig && hyperbridgeClient) {
    return hyperbridgeConfig;
  }

  const rpcUrl = DEFAULT_RPC_URL;
  const vaultAddress = process.env.STEALTH_VAULT_ADDRESS_PASSET as Hex | undefined;

  if (!vaultAddress) {
    throw new Error("Missing STEALTH_VAULT_ADDRESS_PASSET env var.");
  }

  hyperbridgeConfig = {
    chainId: DEFAULT_CHAIN_ID,
    rpcUrl,
    vaultAddress,
  };
  hyperbridgeClient = createPublicClient({
    transport: http(rpcUrl),
  });

  return hyperbridgeConfig;
}

function getPublicClient() {
  if (!hyperbridgeClient) {
    getHyperbridgeContext();
  }
  return hyperbridgeClient!;
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

const parseIndexerBigInt = (value?: string | number | bigint | null): bigint => {
  if (typeof value === "bigint") {
    return value;
  }
  if (typeof value === "number") {
    return BigInt(value);
  }
  if (!value || value.length === 0) {
    return 0n;
  }
  const normalized = value === "0x" || value === "0X" ? "0x0" : value;
  try {
    return BigInt(normalized);
  } catch {
    return 0n;
  }
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

export async function queryStealthBalanceViaHyperbridge(params: {
  stealthId: string;
  assetId: string;
}): Promise<StealthBalanceResult> {
  const stealthHex = assertHex32(params.stealthId, "stealthId");
  const assetHex = assertHex32(params.assetId, "assetId");

  if (INDEXER_BASE_URL) {
    const data = await fetchViaIndexer<{
      chainId: string;
      vaultAddress: Hex;
      stealthId: Hex;
      assetId: Hex;
      slot: Hex;
      raw: string;
      human: string;
    }>("/stealth-balance", {
      stealthId: stealthHex,
      assetId: assetHex,
    });

    return {
      chainId: parseIndexerBigInt(data.chainId),
      vaultAddress: data.vaultAddress,
      stealthId: data.stealthId,
      assetId: data.assetId,
      slot: data.slot,
      raw: parseIndexerBigInt(data.raw),
      human: data.human,
    };
  }

  const { chainId, vaultAddress } = getHyperbridgeContext();
  const client = getPublicClient();
  const slot = computeBalancesSlot(stealthHex, assetHex);

  const storageValue = await client.getStorageAt({
    address: vaultAddress,
    slot,
  });

  const rawValue = storageValue ?? "0x0";
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
  if (INDEXER_BASE_URL) {
    const data = await fetchViaIndexer<{
      chainId: string;
      vaultAddress: Hex;
      stealthId: Hex;
      assetId: Hex;
      slot: Hex;
      raw: string;
      human: string;
      requestedAmount: string;
      canPay: boolean;
    }>("/stealth-credit", {
      stealthId: params.stealthId,
      assetId: params.assetId,
      amount: params.amount.toString(),
    });

    return {
      chainId: parseIndexerBigInt(data.chainId),
      vaultAddress: data.vaultAddress,
      stealthId: data.stealthId,
      assetId: data.assetId,
      slot: data.slot,
      raw: parseIndexerBigInt(data.raw),
      human: data.human,
      requestedAmount: parseIndexerBigInt(data.requestedAmount),
      canPay: data.canPay,
    };
  }

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

export type AggregatedStealthCreditResult = {
  chainId: bigint;
  vaultAddress: Hex;
  stealthId: Hex;
  assetId: Hex;
  slot: Hex;
  raw: bigint;
  human: string;
  requestedAmount: bigint;
  canPay: boolean;
};

export async function queryAggregatedStealthCreditViaHyperbridge(params: {
  stealthPublicId: string;
  assetId: string;
  amount: bigint;
}): Promise<AggregatedStealthCreditResult> {
  const assetHex = assertHex32(params.assetId, "assetId");

  if (INDEXER_BASE_URL) {
    const data = await fetchViaIndexer<{
      chainId: string;
      vaultAddress: Hex;
      stealthId: Hex;
      assetId: Hex;
      slot: Hex;
      raw: string;
      human: string;
      requestedAmount: string;
      canPay: boolean;
    }>("/aggregated-stealth-credit", {
      stealthPublicId: params.stealthPublicId,
      assetId: assetHex,
      amount: params.amount.toString(),
    });

    return {
      chainId: parseIndexerBigInt(data.chainId),
      vaultAddress: data.vaultAddress,
      stealthId: data.stealthId,
      assetId: data.assetId,
      slot: data.slot,
      raw: parseIndexerBigInt(data.raw),
      human: data.human,
      requestedAmount: parseIndexerBigInt(data.requestedAmount),
      canPay: data.canPay,
    };
  }

  throw new Error(
    "Aggregated stealth credit requires HYPERBRIDGE_INDEXER_URL to be configured"
  );
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

  if (INDEXER_BASE_URL) {
    const data = await fetchViaIndexer<{
      chainId: string;
      vaultAddress: Hex;
      invoiceId: Hex;
      slot: Hex;
      raw: string;
      paid: boolean;
    }>("/invoice-status", {
      invoiceId: invoiceHex,
    });

    return {
      chainId: parseIndexerBigInt(data.chainId),
      vaultAddress: data.vaultAddress,
      invoiceId: data.invoiceId,
      slot: data.slot,
      raw: parseIndexerBigInt(data.raw),
      paid: data.paid,
    };
  }

  const { chainId, vaultAddress } = getHyperbridgeContext();
  const client = getPublicClient();
  const structSlot = computeInvoiceStructSlot(invoiceHex);
  const paidSlot = addSlotOffset(structSlot, INVOICE_PAID_OFFSET);

  const storageValue = await client.getStorageAt({
    address: vaultAddress,
    slot: paidSlot,
  });

  const rawValue = storageValue ?? "0x0";
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

async function fetchViaIndexer<T>(endpoint: string, params: Record<string, string>) {
  if (!INDEXER_BASE_URL) {
    throw new Error("Indexer URL is not configured");
  }
  const url = new URL(endpoint.startsWith("/") ? endpoint : `/${endpoint}`, `${INDEXER_BASE_URL}/`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), INDEXER_TIMEOUT_MS);

  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      signal: controller.signal,
      headers: {
        "x-hyperbridge-client": "plata-mia-app",
      },
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.error ?? `Indexer request failed (${response.status})`);
    }
    return data as T;
  } finally {
    clearTimeout(timeout);
  }
}


