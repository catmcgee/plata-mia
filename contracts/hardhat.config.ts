import { defineConfig, configVariable } from "hardhat/config";
import hardhatToolboxViemPlugin from "@nomicfoundation/hardhat-toolbox-viem";
import hardhatIgnitionPlugin from "@nomicfoundation/hardhat-ignition";

// Default public RPC endpoints let us explore the Polkadot ecosystem networks,
// but secrets (like private keys) must live in env vars surfaced through
// Hardhat's configVariable helper.
const DEFAULT_PASSET_RPC = "https://testnet-passet-hub-eth-rpc.polkadot.io";
const DEFAULT_KUSAMA_RPC = "https://kusama-asset-hub-eth-rpc.polkadot.io";

const LOCALHOST_RPC_URL = "http://127.0.0.1:8545";

const passetRpcUrl =
  process.env.PASSET_RPC_URL && process.env.PASSET_RPC_URL.trim().length > 0
    ? configVariable("PASSET_RPC_URL")
    : DEFAULT_PASSET_RPC;
const kusamaRpcUrl =
  process.env.KUSAMA_HUB_RPC_URL &&
  process.env.KUSAMA_HUB_RPC_URL.trim().length > 0
    ? configVariable("KUSAMA_HUB_RPC_URL")
    : DEFAULT_KUSAMA_RPC;

const passetAccounts =
  process.env.PASSET_PRIVATE_KEY &&
  process.env.PASSET_PRIVATE_KEY.trim().length > 0
    ? [configVariable("PASSET_PRIVATE_KEY")]
    : undefined;
const kusamaAccounts =
  process.env.KUSAMA_HUB_PRIVATE_KEY &&
  process.env.KUSAMA_HUB_PRIVATE_KEY.trim().length > 0
    ? [configVariable("KUSAMA_HUB_PRIVATE_KEY")]
    : undefined;

export default defineConfig({
  plugins: [hardhatToolboxViemPlugin, hardhatIgnitionPlugin],
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    // Hardhat in-memory network powers local development + tests (`npx hardhat test nodejs`).
    hardhat: {
      type: "edr-simulated",
      chainType: "l1",
    },
    // Standard localhost endpoint (chainId 31337) to pair with `npx hardhat node`.
    localhost: {
      type: "http",
      chainType: "l1",
      url: LOCALHOST_RPC_URL,
    },
    // Polkadot Hub TestNet (Passet Hub EVM, Paseo). Native token PAS; use faucet funds before deploying.
    passetHubTestnet: {
      type: "http",
      chainType: "l1",
      chainId: 420420422,
      url: passetRpcUrl,
      accounts: passetAccounts,
    },
    // Kusama Hub Asset Hub EVM. Production network that uses real KSM value.
    kusamaHub: {
      type: "http",
      chainType: "l1",
      chainId: 420420418,
      url: kusamaRpcUrl,
      accounts: kusamaAccounts,
    },
  },
  paths: {
    tests: "test",
  },
  test: {
    type: "node",
  },
});
