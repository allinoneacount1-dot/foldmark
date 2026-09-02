export const STOCK_TOKENS = [
  { symbol: "NVDA", name: "NVIDIA", contract: "0x0000000000000000000000000000000000000001", verified: true, type: "stock_token" as const },
  { symbol: "AAPL", name: "Apple", contract: "0x0000000000000000000000000000000000000002", verified: true, type: "stock_token" as const },
  { symbol: "TSLA", name: "Tesla", contract: "0x0000000000000000000000000000000000000003", verified: true, type: "stock_token" as const },
  { symbol: "AMZN", name: "Amazon", contract: "0x0000000000000000000000000000000000000004", verified: true, type: "stock_token" as const },
  { symbol: "MSFT", name: "Microsoft", contract: "0x0000000000000000000000000000000000000005", verified: true, type: "stock_token" as const },
  { symbol: "USDG", name: "USDG Stablecoin", contract: "0x0000000000000000000000000000000000000010", verified: false, type: "crypto" as const },
] as const;

export function isVerifiedStockToken(contract: string) {
  return STOCK_TOKENS.some((t) => t.contract.toLowerCase() === contract.toLowerCase() && t.type === "stock_token" && t.verified);
}
