import { NextResponse } from "next/server";
import { getAssets, getObservedWallets, getProtocols, getContracts } from "@/lib/queries";
import { isAddress, isTxHash } from "@/lib/format";

export const dynamic = "force-dynamic";

export type SearchGroup = "assets" | "wallets" | "protocols" | "contracts";

export type SearchHit = {
  group: SearchGroup;
  id: string;
  title: string;
  subtitle: string;
  href: string;
};

/**
 * Global search across everything the indexer has actually observed.
 * Reads the same tables the pages read, so search and pages never disagree.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const raw = (searchParams.get("q") ?? "").trim();
  const q = raw.toLowerCase();

  if (!q) {
    return NextResponse.json({
      query: raw,
      hits: [],
      counts: { assets: 0, wallets: 0, protocols: 0, contracts: 0 },
      updated_at: new Date().toISOString(),
    });
  }

  const [assets, wallets, protocols, contracts] = await Promise.all([
    getAssets(),
    getObservedWallets(500),
    getProtocols(),
    getContracts(),
  ]);

  const hits: SearchHit[] = [];

  for (const a of assets.rows) {
    if (
      a.symbol.toLowerCase().includes(q) ||
      a.name.toLowerCase().includes(q) ||
      a.contract_address.toLowerCase().includes(q)
    ) {
      hits.push({
        group: "assets",
        id: a.contract_address,
        title: a.symbol,
        subtitle: a.name,
        href: `/assets/${a.contract_address}`,
      });
    }
  }

  for (const w of wallets.rows) {
    if (w.address.toLowerCase().includes(q)) {
      hits.push({ group: "wallets", id: w.address, title: w.address, subtitle: "OBSERVED WALLET", href: `/wallet/${w.address}` });
    }
  }

  // A well-formed address the indexer has not seen is still a valid destination.
  if (isAddress(raw) && !hits.some((h) => h.id.toLowerCase() === q)) {
    hits.push({ group: "wallets", id: raw, title: raw, subtitle: "NOT YET OBSERVED", href: `/wallet/${raw}` });
  }

  for (const p of protocols.rows) {
    if (p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)) {
      hits.push({ group: "protocols", id: p.id, title: p.name, subtitle: p.category.toUpperCase(), href: `/protocol/${p.id}` });
    }
  }

  for (const c of contracts.rows) {
    if (c.address.toLowerCase().includes(q)) {
      hits.push({
        group: "contracts",
        id: c.address,
        title: c.address,
        subtitle: (c.contract_type ?? "CONTRACT").toUpperCase(),
        href: `/wallet/${c.address}`,
      });
    }
  }

  const counts = {
    assets: hits.filter((h) => h.group === "assets").length,
    wallets: hits.filter((h) => h.group === "wallets").length,
    protocols: hits.filter((h) => h.group === "protocols").length,
    contracts: hits.filter((h) => h.group === "contracts").length,
  };

  return NextResponse.json({
    query: raw,
    is_address: isAddress(raw),
    is_tx_hash: isTxHash(raw),
    hits: hits.slice(0, 40),
    counts,
    indexer_state: { assets: assets.state, wallets: wallets.state, protocols: protocols.state },
    updated_at: new Date().toISOString(),
    methodology:
      "Substring match over indexed assets, observed wallets, registered protocols and known contracts. Nothing is matched against a hardcoded list.",
  });
}
