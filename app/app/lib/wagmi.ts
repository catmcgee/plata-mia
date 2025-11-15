import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { mainnet, sepolia } from "wagmi/chains";
import { defineChain } from "viem";

export const hardhatLocal = defineChain({
  id: 31337,
  name: "Hardhat Localhost",
  network: "hardhat-local",
  nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["http://127.0.0.1:8545"] },
    public: { http: ["http://127.0.0.1:8545"] },
  },
  testnet: true,
});

export const polkadotHubTestnet = defineChain({
  id: 420420422,
  name: "Polkadot Hub TestNet",
  network: "polkadot-hub-testnet",
  nativeCurrency: {
    name: "PAS",
    symbol: "PAS",
    decimals: 18,
  },
  rpcUrls: {
    default: { http: ["https://testnet-passet-hub-eth-rpc.polkadot.io"] },
    public: { http: ["https://testnet-passet-hub-eth-rpc.polkadot.io"] },
  },
  testnet: true,
});

export const chains = [hardhatLocal, polkadotHubTestnet, sepolia, mainnet] as const;

export const config = createConfig({
  chains,
  transports: {
    [hardhatLocal.id]: http("http://127.0.0.1:8545"),
    [polkadotHubTestnet.id]: http("https://testnet-passet-hub-eth-rpc.polkadot.io"),
    [sepolia.id]: http(),
    [mainnet.id]: http(),
  },
  connectors: [
    injected({
      target: "metaMask",
    }),
  ],
  ssr: true,
});

