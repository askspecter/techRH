import { NextResponse } from "next/server";
import { isAddress, type Address } from "viem";
import { getPriceInWeth, indexPoolSwaps } from "@/lib/pons/reader";
import { getKv } from "@/lib/kv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface V1Point {
  block: number;
  priceWeth: number;
  priceUsd: number | null;
}
interface V1Chart {
  points: V1Point[];
  ethUsd: number | null;
}

const lastGoodKey = (pool: string, isToken0: boolean) =>
  `creo:chart:v1:${pool.toLowerCase()}:${isToken0 ? 1 : 0}`;

/**
 * GET /api/token/chart?pool=0x...&isToken0=true
 * A price series for the token page chart. History comes from the pool's Swap
 * events (best-effort on the flaky public RPC), and the current price - read
 * reliably from the pool's slot0 sqrtPriceX96 - is always appended as the latest
 * point, so the chart shows the live price even when the historical log scan
 * returns nothing. The assembled series is cached in KV as last-good so a
 * momentary RPC failure never blanks the chart.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const pool = searchParams.get("pool");
  const isToken0 = searchParams.get("isToken0") === "true";

  if (!pool || !isAddress(pool)) {
    return NextResponse.json({ error: "Invalid pool address.", points: [] }, { status: 400 });
  }
  const poolAddr = pool as Address;
  const kv = getKv();

  try {
    const [swaps, live, ethUsd] = await Promise.all([
      indexPoolSwaps(poolAddr, isToken0).catch(() => []),
      getPriceInWeth(poolAddr, isToken0).catch(() => 0),
      getEthUsd(),
    ]);

    const usd = (priceWeth: number) => (ethUsd !== null ? priceWeth * ethUsd : null);
    const points: V1Point[] = swaps.map((s) => ({
      block: s.block,
      priceWeth: s.priceWeth,
      priceUsd: usd(s.priceWeth),
    }));

    // Reliable live price (pool slot0) as the newest point.
    if (live > 0) {
      const block = (points.length ? points[points.length - 1].block : 0) + 1;
      points.push({ block, priceWeth: live, priceUsd: usd(live) });
    }

    if (points.length > 0) {
      const payload: V1Chart = { points, ethUsd };
      if (kv) await kv.set(lastGoodKey(pool, isToken0), payload).catch(() => {});
      return NextResponse.json(payload);
    }

    const cached = await readLastGood();
    if (cached) return NextResponse.json(cached);
    return NextResponse.json({ points: [], ethUsd });
  } catch {
    const cached = await readLastGood();
    if (cached) return NextResponse.json(cached);
    return NextResponse.json({ points: [], ethUsd: null });
  }

  async function readLastGood(): Promise<V1Chart | null> {
    if (!kv) return null;
    const cached = await kv.get<V1Chart>(lastGoodKey(pool!, isToken0)).catch(() => null);
    return cached && Array.isArray(cached.points) && cached.points.length > 0 ? cached : null;
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
