export const STOCK_TOKENS = [
  { symbol: "NVDA", name: "NVIDIA", contract: "0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC", verified: true, type: "stock_token" as const },
  { symbol: "AAPL", name: "Apple", contract: "0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9", verified: true, type: "stock_token" as const },
  { symbol: "TSLA", name: "Tesla", contract: "0x322F0929c4625eD5bAd873c95208D54E1c003b2d", verified: true, type: "stock_token" as const },
  { symbol: "AMZN", name: "Amazon", contract: "0x12f190a9F9d7D37a250758b26824B97CE941bF54", verified: true, type: "stock_token" as const },
  { symbol: "MSFT", name: "Microsoft", contract: "0xe93237C50D904957Cf27E7B1133b510C669c2e74", verified: true, type: "stock_token" as const },
  { symbol: "USDG", name: "USDG Stablecoin", contract: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", verified: true, type: "crypto" as const },
] as const;

export function isVerifiedStockToken(contract: string) {
  return STOCK_TOKENS.some((t) => t.contract.toLowerCase() === contract.toLowerCase() && t.type === "stock_token" && t.verified);
}
