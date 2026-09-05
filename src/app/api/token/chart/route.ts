import { NextResponse } from "next/server";
import { isAddress, type Address } from "viem";
import { indexPoolSwaps } from "@/lib/pons/reader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/token/chart?pool=0x...&isToken0=true
 * A chronological price series (USD when an ETH price is available) built from
 * the pool's Swap events, for the token page chart.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const pool = searchParams.get("pool");
  const isToken0 = searchParams.get("isToken0") === "true";

  if (!pool || !isAddress(pool)) {
    return NextResponse.json({ error: "Invalid pool address.", points: [] }, { status: 400 });
  }

  try {
    const [swaps, ethUsd] = await Promise.all([
      indexPoolSwaps(pool as Address, isToken0),
      getEthUsd(),
    ]);
    const points = swaps.map((s) => ({
      block: s.block,
      priceWeth: s.priceWeth,
      priceUsd: ethUsd !== null ? s.priceWeth * ethUsd : null,
    }));
    return NextResponse.json({ points, ethUsd });
  } catch {
    return NextResponse.json({ points: [], ethUsd: null });
  }
}

async function getEthUsd(): Promise<number | null> {
  try {
    const res = await fetch("https://coins.llama.fi/prices/current/coingecko:ethereum", { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as { coins?: Record<string, { price?: number }> };
    return data.coins?.["coingecko:ethereum"]?.price ?? null;
  } catch {
    return null;
  }
}
