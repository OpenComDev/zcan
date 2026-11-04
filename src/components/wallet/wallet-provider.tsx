"use client";

/**
 * Reown AppKit (WalletConnect) + wagmi for EVM chains and the Solana adapter.
 * Only ever imported through next/dynamic with `ssr: false` (see pay-with-wallet.tsx),
 * so nothing here runs during server rendering or prerender.
 */

import { createAppKit } from "@reown/appkit/react";
import { arbitrum, avalanche, base, bsc, mainnet, optimism, polygon, solana, type AppKitNetwork } from "@reown/appkit/networks";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { SolanaAdapter } from "@reown/appkit-adapter-solana/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { WagmiProvider, type Config } from "wagmi";
import { REOWN_PROJECT_ID } from "./chains";

const networks: [AppKitNetwork, ...AppKitNetwork[]] = [mainnet, base, arbitrum, optimism, polygon, bsc, avalanche, solana];

let setup: { wagmiConfig: Config; queryClient: QueryClient } | null = null;

/** Create AppKit once per page load, in the browser only. */
function getSetup() {
  if (setup) return setup;
  const wagmiAdapter = new WagmiAdapter({ networks, projectId: REOWN_PROJECT_ID, ssr: false });
  const solanaAdapter = new SolanaAdapter();
  createAppKit({
    adapters: [wagmiAdapter, solanaAdapter],
    networks,
    projectId: REOWN_PROJECT_ID,
    metadata: {
      name: "Zcan",
      description: "Private swaps to and from Zcash. No accounts, no custody.",
      url: window.location.origin,
      icons: [`${window.location.origin}/icon.png`],
    },
    themeMode: "dark",
    themeVariables: {
      "--w3m-accent": "#ff2d55",
      "--w3m-color-mix": "#0a0a0b",
      "--w3m-color-mix-strength": 20,
      "--w3m-border-radius-master": "1px",
      "--w3m-font-family": "var(--font-plex-mono), ui-monospace, monospace",
      "--w3m-z-index": 1000,
    },
    features: {
      // Wallet connection only: no Reown analytics, email/social logins, swaps, on-ramp or history.
      analytics: false,
      email: false,
      socials: false,
      swaps: false,
      onramp: false,
      history: false,
      send: false,
      receive: false,
    },
    enableWalletGuide: false,
  });
  setup = { wagmiConfig: wagmiAdapter.wagmiConfig, queryClient: new QueryClient() };
  return setup;
}

/** Wraps only the wallet-pay UI; never mounted in the root layout. */
export function WalletProvider({ children }: { children: ReactNode }) {
  const { wagmiConfig, queryClient } = getSetup();
  return (
    <WagmiProvider config={wagmiConfig} reconnectOnMount={false}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
