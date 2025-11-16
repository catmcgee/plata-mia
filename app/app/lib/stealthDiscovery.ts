import { createPublicClient, http, keccak256, toBytes } from "viem";
import { STEALTH_VAULT_ABI, NATIVE_ASSET_ID } from "./contracts/stealthVault";

/**
 * Discovery service for finding all stealth payments sent to a user
 * Uses the receiverTag to scan StealthPayment events
 */

export type DiscoveredPayment = {
  stealthId: `0x${string}`;
  assetId: `0x${string}`;
  amount: bigint;
  receiverTag: `0x${string}`;
  blockNumber: bigint;
  transactionHash: `0x${string}`;
};

export async function discoverStealthPayments(params: {
  vaultAddress: `0x${string}`;
  rpcUrl: string;
  stealthPublicId: string;
  fromBlock?: bigint;
  toBlock?: bigint;
}): Promise<DiscoveredPayment[]> {
  const client = createPublicClient({
    transport: http(params.rpcUrl),
  });

  // Derive receiverTag from stealthPublicId
  const receiverTag = keccak256(toBytes(params.stealthPublicId)) as `0x${string}`;

  // Get current block to calculate a reasonable range
  const currentBlock = await client.getBlockNumber();

  // Passet Hub has limitations on eth_getLogs, so we use a recent block range
  // Default to last 10000 blocks (~33 hours at 12s blocks) or from deployment
  const defaultFromBlock = currentBlock > 10000n ? currentBlock - 10000n : 0n;

  // Query ALL StealthPayment events (Passet Hub doesn't support complex topic filtering)
  // We'll filter by receiverTag in JavaScript after fetching
  const logs = await client.getLogs({
    address: params.vaultAddress,
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
    // Don't filter by args in the RPC call - Passet Hub doesn't support it well
    fromBlock: params.fromBlock ?? defaultFromBlock,
    toBlock: params.toBlock ?? "latest",
  });

  // Filter by receiverTag in JavaScript
  return logs
    .filter((log) => log.args.receiverTag === receiverTag)
    .map((log) => ({
      stealthId: log.args.stealthId!,
      assetId: log.args.assetId!,
      amount: log.args.amount!,
      receiverTag: log.args.receiverTag!,
      blockNumber: log.blockNumber,
      transactionHash: log.transactionHash,
    }));
}

export async function getAggregatedBalance(params: {
  vaultAddress: `0x${string}`;
  rpcUrl: string;
  stealthPublicId: string;
  assetId?: `0x${string}`;
}): Promise<bigint> {
  const client = createPublicClient({
    transport: http(params.rpcUrl),
  });

  const assetId = params.assetId ?? NATIVE_ASSET_ID;

  // Discover all payments
  const payments = await discoverStealthPayments({
    vaultAddress: params.vaultAddress,
    rpcUrl: params.rpcUrl,
    stealthPublicId: params.stealthPublicId,
  });

  // Filter by assetId and sum balances
  let totalBalance = 0n;

  for (const payment of payments) {
    if (payment.assetId !== assetId) continue;

    // Check current balance for this stealthId
    const balance = await client.readContract({
      address: params.vaultAddress,
      abi: STEALTH_VAULT_ABI,
      functionName: "balances",
      args: [payment.stealthId, assetId],
    });

    totalBalance += balance;
  }

  return totalBalance;
}

/**
 * Find stealthIds with sufficient balance to pay an amount
 * Returns them in order (largest first) so you can pay from fewest UTXOs
 */
export async function findPayableStealthIds(params: {
  vaultAddress: `0x${string}`;
  rpcUrl: string;
  stealthPublicId: string;
  amount: bigint;
  assetId?: `0x${string}`;
}): Promise<Array<{ stealthId: `0x${string}`; balance: bigint }>> {
  const client = createPublicClient({
    transport: http(params.rpcUrl),
  });

  const assetId = params.assetId ?? NATIVE_ASSET_ID;

  // Discover all payments
  const payments = await discoverStealthPayments({
    vaultAddress: params.vaultAddress,
    rpcUrl: params.rpcUrl,
    stealthPublicId: params.stealthPublicId,
  });

  // Get balances for each stealthId
  const balances: Array<{ stealthId: `0x${string}`; balance: bigint }> = [];

  for (const payment of payments) {
    if (payment.assetId !== assetId) continue;

    const balance = await client.readContract({
      address: params.vaultAddress,
      abi: STEALTH_VAULT_ABI,
      functionName: "balances",
      args: [payment.stealthId, assetId],
    });

    if (balance > 0n) {
      balances.push({ stealthId: payment.stealthId, balance });
    }
  }

  // Sort by balance (largest first)
  balances.sort((a, b) => (a.balance > b.balance ? -1 : 1));

  // Return enough stealthIds to cover the amount
  const payable: typeof balances = [];
  let accumulated = 0n;

  for (const item of balances) {
    payable.push(item);
    accumulated += item.balance;
    if (accumulated >= params.amount) break;
  }

  return payable;
}
