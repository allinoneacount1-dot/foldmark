import { NextResponse } from "next/server";

export async function GET(_: Request, { params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return NextResponse.json({ error: "INVALID_ADDRESS", address }, { status: 400 });
  }
  return NextResponse.json({
    address,
    portfolio_value: "DATA UNAVAILABLE",
    observation_window: "24h",
    sources: ["Robinhood Chain RPC"],
    updated_at: new Date().toISOString(),
    methodology: "Portfolio = sum of observed asset exposures. Requires indexer.",
  });
}
