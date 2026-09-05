import { NextResponse } from "next/server";
import { isAddress } from "viem";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/token/market?address=0x...
 * Price, market cap, and 24h volume for any token, plus the best DEX pair
 * (chain slug + pair address) so the client can embed the DexScreener chart.
 * Sourced from the public DexScreener API, which indexes Robinhood Chain.
 * Returns { pair: null } when no DEX market is found, so the UI can degrade.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const address = searchParams.get("address");
  if (!address || !isAddress(address)) {
    return NextResponse.json({ error: "Invalid token address.", pair: null }, { status: 400 });
  }

  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${address}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
      headers: { accept: "application/json" },
    });
    if (!res.ok) return NextResponse.json({ pair: null });

    const data = (await res.json()) as { pairs?: DexPair[] };
    const pairs = Array.isArray(data.pairs) ? data.pairs : [];
    if (pairs.length === 0) return NextResponse.json({ pair: null });

    // Best market = deepest liquidity.
    const best = pairs
      .slice()
      .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];

    return NextResponse.json({
      pair: {
        chainId: best.chainId,
        dexId: best.dexId,
        pairAddress: best.pairAddress,
        url: best.url,
        priceUsd: best.priceUsd ? Number(best.priceUsd) : null,
        marketCap: best.marketCap ?? best.fdv ?? null,
        fdv: best.fdv ?? null,
        volume24h: best.volume?.h24 ?? null,
        priceChange24h: best.priceChange?.h24 ?? null,
        liquidityUsd: best.liquidity?.usd ?? null,
        name: best.baseToken?.name ?? null,
        symbol: best.baseToken?.symbol ?? null,
        quoteSymbol: best.quoteToken?.symbol ?? null,
        image: best.info?.imageUrl ?? null,
      },
    });
  } catch {
    return NextResponse.json({ pair: null });
  }
}

interface DexPair {
  chainId: string;
  dexId: string;
  pairAddress: string;
  url: string;
  priceUsd?: string;
  marketCap?: number;
  fdv?: number;
  volume?: { h24?: number; h6?: number; h1?: number; m5?: number };
  priceChange?: { h24?: number };
  liquidity?: { usd?: number };
  baseToken?: { address: string; name?: string; symbol?: string };
  quoteToken?: { symbol?: string };
  info?: { imageUrl?: string };
}
