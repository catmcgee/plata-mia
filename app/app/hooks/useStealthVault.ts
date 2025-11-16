"use client";

import { useCallback, useMemo } from "react";
import {
  useAccount,
  useChainId,
  usePublicClient,
  useWalletClient,
} from "wagmi";
import { getWalletClient } from "wagmi/actions";

import {
  ERC20_ABI,
  MERCHANT_ADDRESS_PASSET,
  NATIVE_ASSET_ID,
  STEALTH_VAULT_ABI,
  STEALTH_VAULT_ADDRESS_PASSET,
  TEST_ASSET_ID,
  TEST_TOKEN_ADDRESS_PASSET,
} from "../lib/contracts/stealthVault";
import { config, polkadotHubTestnet } from "../lib/wagmi";

type DepositArgs = {
  stealthId: `0x${string}`;
  amount: bigint;
  receiverTag: `0x${string}`;
};

type WithdrawArgs = {
  stealthId: `0x${string}`;
  amount: bigint;
  to?: `0x${string}`;
};

type CreateInvoiceArgs = {
  invoiceId: `0x${string}`;
  amount: bigint;
  merchantOverride?: `0x${string}`;
};

type PayInvoiceArgs = {
  stealthId: `0x${string}`;
  invoiceId: `0x${string}`;
};

type PayInvoiceMultiArgs = {
  stealthIds: `0x${string}`[];
  invoiceId: `0x${string}`;
};

type NetworkConfig = {
  chainId: number;
  label: string;
  vaultAddress?: `0x${string}`;
  tokenAddress?: `0x${string}`;
};

const NETWORK_CONFIGS: Record<number, NetworkConfig> = {
  [polkadotHubTestnet.id]: {
    chainId: polkadotHubTestnet.id,
    label: "Polkadot Hub TestNet",
    vaultAddress: STEALTH_VAULT_ADDRESS_PASSET,
    tokenAddress: TEST_TOKEN_ADDRESS_PASSET,
  },
};

const SUPPORTED_CHAIN_IDS = Object.keys(NETWORK_CONFIGS).map((id) =>
  Number(id)
);

export function useStealthVault() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const activeNetworkConfig = useMemo(() => {
    if (!chainId) {
      return undefined;
    }
    return NETWORK_CONFIGS[chainId];
  }, [chainId]);

  const ensureReady = useCallback(async () => {
    if (!publicClient) {
      throw new Error(
        "Public client unavailable. Ensure your wagmi config includes this chain."
      );
    }

    if (!address || !isConnected) {
      throw new Error("Connect your wallet to interact with the vault.");
    }

    const preferredChainId =
      chainId ?? walletClient?.chain?.id ?? polkadotHubTestnet.id;
    const networkConfig = NETWORK_CONFIGS[preferredChainId];

    if (!networkConfig) {
      throw new Error(
        "Unsupported network. Please switch to Polkadot Hub TestNet via Hyperbridge."
      );
    }

    if (!networkConfig.vaultAddress) {
      throw new Error(
        `StealthVault address not configured for ${networkConfig.label}.`
      );
    }

    if (!networkConfig.tokenAddress) {
      throw new Error(
        `Test token address not configured for ${networkConfig.label}.`
      );
    }

    let activeWalletClient = walletClient;

    if (!activeWalletClient) {
      try {
        activeWalletClient = await getWalletClient(config, {
          chainId: networkConfig.chainId,
          account: address,
        });
      } catch (error) {
        console.error("Failed to get wallet client:", error);
        throw new Error(
          "Wallet client unavailable. Please try reconnecting your wallet."
        );
      }
    }

    if (!activeWalletClient) {
      throw new Error("Wallet client not ready. Please try again in a moment.");
    }

    const walletChainId = activeWalletClient.chain?.id;
    if (walletChainId && walletChainId !== networkConfig.chainId) {
      throw new Error(
        `Please switch your wallet to ${networkConfig.label} (chainId ${networkConfig.chainId}).`
      );
    }

    return {
      walletClient: activeWalletClient,
      publicClient,
      account: address,
      networkConfig,
    };
  }, [address, chainId, isConnected, publicClient, walletClient]);

  const depositStealth = useCallback(
    async (args: DepositArgs) => {
      const {
        walletClient: client,
        publicClient: rpcClient,
        networkConfig,
        account,
      } = await ensureReady();

      const { vaultAddress, tokenAddress } = networkConfig;
      if (!vaultAddress || !tokenAddress) {
        throw new Error(
          "StealthVault or token address missing for current network."
        );
      }

      const currentAllowance = await rpcClient.readContract({
        abi: ERC20_ABI,
        address: tokenAddress,
        functionName: "allowance",
        args: [account, vaultAddress],
      });

      if (currentAllowance < args.amount) {
        const approveHash = await client.writeContract({
          abi: ERC20_ABI,
          address: tokenAddress,
          functionName: "approve",
          args: [vaultAddress, args.amount],
          account,
        });
        await rpcClient.waitForTransactionReceipt({ hash: approveHash });
      }

      const hash = await client.writeContract({
        abi: STEALTH_VAULT_ABI,
        address: vaultAddress,
        functionName: "depositStealth",
        args: [args.stealthId, TEST_ASSET_ID, args.amount, args.receiverTag],
        account,
      });

      const receipt = await rpcClient.waitForTransactionReceipt({ hash });
      return { hash, receipt };
    },
    [ensureReady]
  );

  const depositStealthNative = useCallback(
    async (args: {
      stealthId: `0x${string}`;
      receiverTag: `0x${string}`;
      amount: bigint;
    }) => {
      const {
        walletClient: client,
        publicClient: rpcClient,
        networkConfig,
        account,
      } = await ensureReady();

      const { vaultAddress } = networkConfig;
      if (!vaultAddress) {
        throw new Error("StealthVault address missing for current network.");
      }

      const hash = await client.writeContract({
        abi: STEALTH_VAULT_ABI,
        address: vaultAddress,
        functionName: "depositStealthNative",
        args: [args.stealthId, args.receiverTag],
        value: args.amount,
        account,
      });

      const receipt = await rpcClient.waitForTransactionReceipt({ hash });
      return { hash, receipt };
    },
    [ensureReady]
  );

  const withdraw = useCallback(
    async (args: WithdrawArgs) => {
      const {
        walletClient: client,
        publicClient: rpcClient,
        networkConfig,
        account,
      } = await ensureReady();

      const { vaultAddress } = networkConfig;
      if (!vaultAddress) {
        throw new Error("StealthVault address missing for current network.");
      }

      const recipient = args.to ?? account;
      const hash = await client.writeContract({
        abi: STEALTH_VAULT_ABI,
        address: vaultAddress,
        functionName: "withdraw",
        args: [args.stealthId, NATIVE_ASSET_ID, recipient, args.amount],
        account,
      });

      const receipt = await rpcClient.waitForTransactionReceipt({ hash });
      return { hash, receipt };
    },
    [ensureReady]
  );

  const createInvoice = useCallback(
    async (args: CreateInvoiceArgs) => {
      const {
        walletClient: client,
        publicClient: rpcClient,
        networkConfig,
        account,
      } = await ensureReady();

      const { vaultAddress } = networkConfig;
      if (!vaultAddress) {
        throw new Error("StealthVault address missing for current network.");
      }

      const merchant =
        args.merchantOverride ??
        MERCHANT_ADDRESS_PASSET ??
        account ??
        undefined;

      if (!merchant) {
        throw new Error("No merchant address available for invoice creation.");
      }

      const hash = await client.writeContract({
        abi: STEALTH_VAULT_ABI,
        address: vaultAddress,
        functionName: "createInvoice",
        args: [args.invoiceId, merchant, NATIVE_ASSET_ID, args.amount],
        account,
      });

      const receipt = await rpcClient.waitForTransactionReceipt({ hash });
      return { hash, receipt };
    },
    [ensureReady]
  );

  const payInvoice = useCallback(
    async (args: PayInvoiceArgs) => {
      const {
        walletClient: client,
        publicClient: rpcClient,
        networkConfig,
        account,
      } = await ensureReady();

      const { vaultAddress } = networkConfig;
      if (!vaultAddress) {
        throw new Error("StealthVault address missing for current network.");
      }

      const hash = await client.writeContract({
        abi: STEALTH_VAULT_ABI,
        address: vaultAddress,
        functionName: "payInvoice",
        args: [args.stealthId, NATIVE_ASSET_ID, args.invoiceId],
        account,
      });

      const receipt = await rpcClient.waitForTransactionReceipt({ hash });
      return { hash, receipt };
    },
    [ensureReady]
  );

  const payInvoiceMulti = useCallback(
    async (args: PayInvoiceMultiArgs) => {
      const {
        walletClient: client,
        publicClient: rpcClient,
        networkConfig,
        account,
      } = await ensureReady();

      const { vaultAddress } = networkConfig;
      if (!vaultAddress) {
        throw new Error("StealthVault address missing for current network.");
      }

      const hash = await client.writeContract({
        abi: STEALTH_VAULT_ABI,
        address: vaultAddress,
        functionName: "payInvoiceMulti",
        args: [args.stealthIds, NATIVE_ASSET_ID, args.invoiceId],
        account,
      });

      const receipt = await rpcClient.waitForTransactionReceipt({ hash });
      return { hash, receipt };
    },
    [ensureReady]
  );

  const vaultAddress = activeNetworkConfig?.vaultAddress;
  const tokenAddress = activeNetworkConfig?.tokenAddress;

  return {
    address,
    chainId,
    supportedChainIds: SUPPORTED_CHAIN_IDS,
    networkLabel: activeNetworkConfig?.label,
    vaultAddress,
    tokenAddress,
    isConfigured: Boolean(vaultAddress && tokenAddress),
    depositStealth,
    depositStealthNative,
    withdraw,
    createInvoice,
    payInvoice,
    payInvoiceMulti,
  };
}

export default useStealthVault;
