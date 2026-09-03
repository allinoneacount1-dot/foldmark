import { NextResponse } from "next/server";
import { getProtocols, getContracts } from "@/lib/queries";
import { CHAIN } from "@/config/site";

export const dynamic = "force-dynamic";

/** The verified protocol registry. Empty is a valid, honest answer. */
export async function GET() {
  const [protocols, contracts] = await Promise.all([getProtocols(), getContracts()]);

  const byProtocol = new Map<string, string[]>();
  for (const c of contracts.rows) {
    if (!c.protocol_id) continue;
    const list = byProtocol.get(c.protocol_id) ?? [];
    list.push(c.address);
    byProtocol.set(c.protocol_id, list);
  }

  return NextResponse.json({
    protocols: protocols.rows.map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      verified: p.verified,
      website: p.website,
      contracts: byProtocol.get(p.id) ?? [],
    })),
    count: protocols.rows.length,
    state: protocols.state,
    unattributed_contracts: contracts.rows.filter((c) => !c.protocol_id).length,
    chain_id: CHAIN.id,
    updated_at: new Date().toISOString(),
    methodology:
      "A protocol is listed only when its contracts are registered and verified. FOLDMARK does not infer protocol identity from on-chain behaviour, so an empty registry means no protocol has been verified on this chain yet.",
  });
}
