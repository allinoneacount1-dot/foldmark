/**
 * FOLDMARK — single source of truth for identity, navigation and outbound links.
 * Change a URL here, not in a component.
 */

export const SITE = {
  name: "FOLDMARK",
  positioning: "Market Intelligence Layer for Robinhood Chain",
  description:
    "FOLDMARK turns raw Robinhood Chain activity into readable financial structure — assets, wallets, protocols, liquidity, counterparties and capital flows, connected into one market map.",
  url: "https://foldmark.xyz",
} as const;

export const CHAIN = {
  id: 4663,
  name: "Robinhood Chain",
  explorer: "https://robinhoodchain.blockscout.com",
} as const;

export const NAV: ReadonlyArray<{ label: string; href: string }> = [
  { label: "OVERVIEW", href: "/" },
  { label: "DASHBOARD", href: "/dashboard" },
  { label: "ASSETS", href: "/assets" },
  { label: "FABRIC", href: "/fabric" },
  { label: "FLOWS", href: "/flows" },
  { label: "PROTOCOLS", href: "/protocols" },
  { label: "DEVELOPERS", href: "/developers" },
  { label: "DOCS", href: "/docs" },
];

export const FOOTER_NAV: ReadonlyArray<{ group: string; links: ReadonlyArray<{ label: string; href: string }> }> = [
  {
    group: "PRODUCT",
    links: [
      { label: "Dashboard", href: "/dashboard" },
      { label: "Assets", href: "/assets" },
      { label: "Fabric", href: "/fabric" },
      { label: "Flows", href: "/flows" },
      { label: "Protocols", href: "/protocols" },
      { label: "Wallets", href: "/wallets" },
    ],
  },
  {
    group: "BUILD",
    links: [
      { label: "Documentation", href: "/docs" },
      { label: "API reference", href: "/docs/api" },
      { label: "Methodology", href: "/docs/methodology" },
      { label: "Architecture", href: "/docs/architecture" },
      { label: "Status", href: "/docs/status" },
      { label: "Developers", href: "/developers" },
    ],
  },
];

export const WINDOWS = ["1H", "6H", "24H", "7D", "30D"] as const;
export type FlowWindow = (typeof WINDOWS)[number];

export const WINDOW_MS: Record<FlowWindow, number> = {
  "1H": 3_600_000,
  "6H": 21_600_000,
  "24H": 86_400_000,
  "7D": 604_800_000,
  "30D": 2_592_000_000,
};

export const ASSET_TYPES = ["stock_token", "crypto", "stablecoin", "other"] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

/** Canonical label. Never "tokenized stocks" / "tokenized equities". */
export const ASSET_TYPE_LABEL: Record<AssetType, string> = {
  stock_token: "STOCK TOKEN",
  crypto: "CRYPTO",
  stablecoin: "STABLECOIN",
  other: "OTHER",
};
