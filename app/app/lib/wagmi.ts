import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { defineChain } from "viem";

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

export const chains = [polkadotHubTestnet] as const;

export const config = createConfig({
  chains,
  transports: {
    [polkadotHubTestnet.id]: http("https://testnet-passet-hub-eth-rpc.polkadot.io"),
  },
  connectors: [
    injected({
      target: "metaMask",
    }),
  ],
  ssr: true,
});

