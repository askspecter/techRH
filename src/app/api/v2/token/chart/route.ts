import { NextResponse } from "next/server";
import { isAddress, type Address } from "viem";
import {
  getCurveState,
  getLaunchedTokenV2,
  getQuoteMeta,
  indexCurveTrades,
  readTokenInfoV2,
} from "@/lib/pons/readerV2";
import { getKv } from "@/lib/kv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface V2Point {
  block: number;
  price: number;
  priceUsd: number | null;
}
interface V2Chart {
  points: V2Point[];
  quoteSymbol: string;
  ethUsd: number | null;
}

const lastGoodKey = (t: string) => `creo:chart:v2:${t.toLowerCase()}`;

/**
 * GET /api/v2/token/chart?address=0x...
 * A price series for the v2 token page chart. History comes from the bonding
 * curve's CurveBuy / CurveSell events (best-effort on the flaky public RPC), and
 * the current spot price - read reliably from the curve's reserves - is always
 * appended as the latest point, so the chart shows the live price even when the
 * historical log scan returns nothing. The assembled series is cached in KV as
 * last-good so a momentary RPC failure never blanks the chart.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const address = searchParams.get("address");
  if (!address || !isAddress(address)) {
    return NextResponse.json({ error: "Invalid token address.", points: [] }, { status: 400 });
  }
  const token = address as Address;
  const kv = getKv();

  try {
    const [record, info] = await Promise.all([getLaunchedTokenV2(token), readTokenInfoV2(token)]);
    if (!record.exists || !record.curve) {
      return NextResponse.json({ points: [], quoteSymbol: "ETH" });
    }

    const quote = await getQuoteMeta(record.curve);
    const [trades, state, ethUsd] = await Promise.all([
      indexCurveTrades(record.curve, info.decimals, quote.decimals).catch(() => []),
      getCurveState(record.curve).catch(() => null),
      quote.isNative ? getEthUsd() : Promise.resolve(null),
    ]);

    const usd = (price: number) => (quote.isNative && ethUsd !== null ? price * ethUsd : null);
    const points: V2Point[] = trades.map((t) => ({ block: t.block, price: t.price, priceUsd: usd(t.price) }));

    // Reliable live spot price (reserves ratio) as the newest point.
    if (state && state.spotPrice > 0) {
      const block = (points.length ? points[points.length - 1].block : 0) + 1;
      points.push({ block, price: state.spotPrice, priceUsd: usd(state.spotPrice) });
    }

    const quoteSymbol = quote.isNative ? "ETH" : "quote";
    if (points.length > 0) {
      const payload: V2Chart = { points, quoteSymbol, ethUsd };
      if (kv) await kv.set(lastGoodKey(token), payload).catch(() => {});
      return NextResponse.json(payload);
    }

    const cached = await readLastGood(token);
    if (cached) return NextResponse.json(cached);
    return NextResponse.json({ points: [], quoteSymbol });
  } catch {
    const cached = await readLastGood(token);
    if (cached) return NextResponse.json(cached);
    return NextResponse.json({ points: [], quoteSymbol: "ETH" });
  }

  async function readLastGood(t: Address): Promise<V2Chart | null> {
    if (!kv) return null;
    const cached = await kv.get<V2Chart>(lastGoodKey(t)).catch(() => null);
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
