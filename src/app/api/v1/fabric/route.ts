import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    nodes: [],
    edges: [],
    status: "INDEXING",
    updated_at: new Date().toISOString(),
    methodology: "Nodes = assets/protocols/wallets with observed activity. Edges = classified relationships. Aggregated server-side.",
  });
}
