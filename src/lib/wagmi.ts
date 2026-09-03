import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { defineChain } from "viem";

export const robinhoodChain = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  network: "robinhood",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    // Ordered by what actually answered when probed on 2026-09-03. The endpoint
    // this file used to hold on its own refused every connection, which took the
    // whole chain read down with it; viem falls back through the list instead.
    default: {
      http: [
        ...(process.env.NEXT_PUBLIC_ROBINHOOD_RPC ? [process.env.NEXT_PUBLIC_ROBINHOOD_RPC] : []),
        "https://robinhood-rpc.publicnode.com",
        "https://rpc.mainnet.chain.robinhood.com",
      ],
      webSocket: ["wss://robinhood-rpc.publicnode.com"],
    },
  },
  blockExplorers: {
    default: { name: "Blockscout", url: "https://robinhoodchain.blockscout.com" },
  },
});

export const wagmiConfig = createConfig({
  chains: [robinhoodChain],
  transports: {
    [robinhoodChain.id]: http(),
  },
  connectors: [injected()],
  ssr: true,
});
