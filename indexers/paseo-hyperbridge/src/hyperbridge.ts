import { randomUUID } from "node:crypto";

import { IndexerClient, createQueryClient } from "@hyperbridge/sdk";
import type { Logger } from "pino";
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

import type { RuntimeConfig } from "./config";
import type { IndexerState, PacketRecord } from "./state";
import type {
  InvoiceStatusResult,
  StealthBalanceParams,
  StealthBalanceResult,
  StealthCreditParams,
  StealthCreditResult,
} from "./types";

const encoder = parseAbiParameters("bytes32, uint256");
// IMPORTANT: token is immutable, so it doesn't occupy a storage slot
// Therefore balances is at slot 0, not slot 1
const BALANCES_BASE_SLOT = 0n;
const INVOICES_BASE_SLOT = 1n;
const INVOICE_PAID_OFFSET = 3n;

type MaybeEmitter = {
  start?: () => Promise<void>;
  stop?: () => Promise<void>;
  on?: (event: string, cb: (payload: unknown) => void) => void;
};

function assertHex32(value: string, label: string): Hex {
  if (!value || !value.startsWith("0x")) {
    throw new Error(`${label} must be a 0x-prefixed hex string`);
  }
  const bytes = hexToBytes(value as Hex);
  if (bytes.length !== 32) {
    throw new Error(`${label} must be 32 bytes (received ${bytes.length})`);
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

function normalizePacket(raw: unknown): PacketRecord {
  const packet = raw as Record<string, unknown>;
  const maybeHeight = Number(packet?.height ?? packet?.blockNumber ?? 0);
  return {
    id: String(packet?.id ?? packet?.packetId ?? randomUUID()),
    height: Number.isFinite(maybeHeight) ? maybeHeight : undefined,
    source: (packet?.source as string) ?? (packet?.sourceStateMachineId as string),
    dest: (packet?.dest as string) ?? (packet?.destStateMachineId as string),
    timestamp: packet?.timestamp ? Number(packet.timestamp) : Date.now(),
    raw,
  };
}

export type HyperbridgeService = ReturnType<typeof createHyperbridgeService>;

export function createHyperbridgeService(
  config: RuntimeConfig,
  state: IndexerState,
  logger: Logger
) {
  const vaultAddress = config.STEALTH_VAULT_ADDRESS_PASSET as Hex;
  const chainId = config.HYPERBRIDGE_DEST_CHAIN_ID;

  const pasetClient = createPublicClient({
    transport: http(config.PASSET_RPC_URL),
  });

  const queryClient = createQueryClient({
    url: config.HYPERBRIDGE_QUERY_URL,
  });

  const indexer = new IndexerClient({
    queryClient,
    pollInterval: config.HYPERBRIDGE_INDEXER_POLL_INTERVAL_MS,
    source: {
      consensusStateId: config.HYPERBRIDGE_SOURCE_CONSENSUS_STATE_ID,
      rpcUrl: config.PASEO_RPC_URL,
      stateMachineId: config.HYPERBRIDGE_SOURCE_STATE_MACHINE_ID,
      host: config.HYPERBRIDGE_SOURCE_HOST,
    },
    dest: {
      consensusStateId: config.HYPERBRIDGE_DEST_CONSENSUS_STATE_ID,
      rpcUrl: config.PASSET_RPC_URL,
      stateMachineId: config.HYPERBRIDGE_DEST_STATE_MACHINE_ID,
      host: config.HYPERBRIDGE_DEST_HOST,
    },
  });

  const emitter = indexer as unknown as MaybeEmitter;

  async function queryStealthBalance(params: StealthBalanceParams): Promise<StealthBalanceResult> {
    const slot = computeBalancesSlot(params.stealthId, params.assetId);
    const storageValue = await pasetClient.getStorageAt({
      address: vaultAddress,
      slot,
    });
    const normalizedValue = !storageValue || storageValue === "0x" ? "0x0" : storageValue;
    const raw = hexToBigInt(normalizedValue);

    return {
      chainId,
      vaultAddress,
      stealthId: params.stealthId,
      assetId: params.assetId,
      slot,
      raw,
      human: (Number(raw) / 1e18).toFixed(4),
    };
  }

  async function queryStealthCredit(params: StealthCreditParams): Promise<StealthCreditResult> {
    const balance = await queryStealthBalance(params);
    return {
      ...balance,
      requestedAmount: params.amount,
      canPay: balance.raw >= params.amount,
    };
  }

  async function queryInvoiceStatus(invoiceId: Hex): Promise<InvoiceStatusResult> {
    const structSlot = computeInvoiceStructSlot(invoiceId);
    const paidSlot = addSlotOffset(structSlot, INVOICE_PAID_OFFSET);
    const storageValue = await pasetClient.getStorageAt({
      address: vaultAddress,
      slot: paidSlot,
    });
    const normalizedValue = !storageValue || storageValue === "0x" ? "0x0" : storageValue;
    const raw = hexToBigInt(normalizedValue);
    return {
      chainId,
      vaultAddress,
      invoiceId,
      slot: paidSlot,
      raw,
      paid: raw !== 0n,
    };
  }

  async function queryAggregatedBalance(params: {
    stealthPublicId: string;
    assetId: Hex;
  }): Promise<StealthCreditResult> {
    // Derive receiverTag from stealthPublicId
    const receiverTag = keccak256(params.stealthPublicId as Hex) as Hex;

    // Get current block for range
    const currentBlock = await pasetClient.getBlockNumber();
    const defaultFromBlock = currentBlock > 10000n ? currentBlock - 10000n : 0n;

    // Query ALL StealthPayment events from the vault
    const logs = await pasetClient.getLogs({
      address: vaultAddress,
      event: {
        type: "event",
        name: "StealthPayment",
        inputs: [
          { name: "stealthId", type: "bytes32", indexed: true },
          { name: "assetId", type: "bytes32", indexed: true },
          { name: "amount", type: "uint256", indexed: false },
          { name: "receiverTag", type: "bytes32", indexed: true },
        ],
      },
      fromBlock: defaultFromBlock,
      toBlock: "latest",
    });

    // Filter by receiverTag and assetId in JavaScript
    const relevantPayments = logs.filter(
      (log) => log.args.receiverTag === receiverTag && log.args.assetId === params.assetId
    );

    // Aggregate balances from all discovered stealthIds
    let totalBalance = 0n;

    for (const payment of relevantPayments) {
      const stealthId = payment.args.stealthId as Hex;
      const slot = computeBalancesSlot(stealthId, params.assetId);

      const storageValue = await pasetClient.getStorageAt({
        address: vaultAddress,
        slot,
      });

      const normalizedValue = !storageValue || storageValue === "0x" ? "0x0" : storageValue;
      const balance = hexToBigInt(normalizedValue);
      totalBalance += balance;
    }

    return {
      chainId,
      vaultAddress,
      stealthId: receiverTag, // Use receiverTag as the identifier
      assetId: params.assetId,
      slot: receiverTag, // Not a real slot, but needed for the type
      raw: totalBalance,
      human: (Number(totalBalance) / 1e18).toFixed(4),
      requestedAmount: 0n,
      canPay: true, // Will be computed by the caller
    };
  }

  let started = false;

  async function start() {
    if (started) return;

    if (typeof emitter.on === "function") {
      emitter.on("packet", (packet) => state.pushPacket(normalizePacket(packet)));
      emitter.on("receipt", (receipt) => state.pushReceipt(normalizePacket(receipt)));
      emitter.on("error", (error) => logger.error({ err: error }, "Hyperbridge SDK error"));
    } else {
      logger.warn("IndexerClient does not expose EventEmitter hooks, packets will not be cached");
    }

    if (typeof emitter.start === "function") {
      await emitter.start();
    } else if (typeof (indexer as { init?: () => Promise<void> }).init === "function") {
      await (indexer as { init?: () => Promise<void> }).init!();
    } else {
      logger.info("IndexerClient started implicitly");
    }

    started = true;
    logger.info("Hyperbridge SDK indexer started");
  }

  async function stop() {
    if (!started) return;
    if (typeof emitter.stop === "function") {
      await emitter.stop();
    }
    started = false;
  }

  return {
    start,
    stop,
    queryStealthBalance,
    queryStealthCredit,
    queryAggregatedBalance,
    queryInvoiceStatus,
    snapshot: () => state.snapshot(),
    assertHex32,
  };
}

