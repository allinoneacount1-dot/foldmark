import { NextResponse } from "next/server";
import { buildAssetContext } from "@/lib/context";
import { WINDOWS, CHAIN, type FlowWindow } from "@/config/site";

export const dynamic = "force-dynamic";

/** Unified agent context for one asset. Shares its builder with the landing page. */
export async function GET(req: Request, { params }: { params: Promise<{ asset: string }> }) {
  const { asset } = await params;
  const { searchParams } = new URL(req.url);
  const requested = searchParams.get("window") as FlowWindow | null;
  const window: FlowWindow = requested && WINDOWS.includes(requested) ? requested : "24H";

  const context = await buildAssetContext(asset, window);
  if (!context) {
    return NextResponse.json(
      {
        error: "ASSET_NOT_INDEXED",
        asset,
        chain_id: CHAIN.id,
        methodology: "An asset resolves once the indexer has observed an ERC-20 Transfer for its contract.",
      },
      { status: 404 },
    );
  }
  return NextResponse.json(context);
}
