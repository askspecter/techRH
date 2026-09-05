import { NextResponse } from "next/server";
import { isAddress, type Address } from "viem";
import { getLaunchedTokenV2, getQuoteMeta, indexCurveTrades, readTokenInfoV2 } from "@/lib/pons/readerV2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v2/token/chart?address=0x...
 * A chronological price series built from the bonding curve's CurveBuy /
 * CurveSell events (price of the token in its quote asset, plus USD when the
 * quote is native ETH), for the v2 token page chart.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const address = searchParams.get("address");
  if (!address || !isAddress(address)) {
    return NextResponse.json({ error: "Invalid token address.", points: [] }, { status: 400 });
  }
  const token = address as Address;

  try {
    const [record, info] = await Promise.all([getLaunchedTokenV2(token), readTokenInfoV2(token)]);
    if (!record.exists || !record.curve) {
      return NextResponse.json({ points: [], quoteSymbol: "ETH" });
    }

    const quote = await getQuoteMeta(record.curve);
    const [trades, ethUsd] = await Promise.all([
      indexCurveTrades(record.curve, info.decimals, quote.decimals),
      quote.isNative ? getEthUsd() : Promise.resolve(null),
    ]);

    const points = trades.map((t) => ({
      block: t.block,
      price: t.price,
      priceUsd: quote.isNative && ethUsd !== null ? t.price * ethUsd : null,
    }));

    return NextResponse.json({ points, quoteSymbol: quote.isNative ? "ETH" : "quote", ethUsd });
  } catch {
    return NextResponse.json({ points: [], quoteSymbol: "ETH" });
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
