import { NextResponse } from "next/server";
import { isAddress, type Address } from "viem";
import {
  blockTimestamps,
  getLaunchedTokenV2,
  getQuoteMeta,
  indexCurveTradeRows,
  readTokenInfoV2,
} from "@/lib/pons/readerV2";
import { pairAssetSymbol } from "@/lib/pons/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RECENT = 20;

/**
 * GET /api/v2/token/activity?address=0x...
 * Trade activity for a v2 token: total volume (in the quote asset), trade count,
 * and the most recent trades (side, account, amounts, timestamp) for the trades
 * table on the token page.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const address = searchParams.get("address");
  if (!address || !isAddress(address)) {
    return NextResponse.json({ error: "Invalid token address.", trades: [] }, { status: 400 });
  }
  const token = address as Address;

  try {
    const [record, info] = await Promise.all([getLaunchedTokenV2(token), readTokenInfoV2(token)]);
    if (!record.exists || !record.curve) {
      return NextResponse.json({ trades: [], volume: 0, tradeCount: 0, quoteSymbol: "ETH", quoteIsNative: true, ethUsd: null });
    }

    const quote = await getQuoteMeta(record.curve);
    const rows = await indexCurveTradeRows(record.curve, info.decimals, quote.decimals);

    const volume = rows.reduce((sum, r) => sum + r.quote, 0);
    const recent = rows.slice(-RECENT).reverse();
    const [ts, ethUsd] = await Promise.all([
      blockTimestamps(recent.map((r) => r.block)),
      quote.isNative ? getEthUsd() : Promise.resolve(null),
    ]);

    return NextResponse.json({
      quoteSymbol: quote.isNative ? "ETH" : pairAssetSymbol(record.pairToken),
      quoteIsNative: quote.isNative,
      ethUsd,
      volume,
      tradeCount: rows.length,
      trades: recent.map((r) => ({
        type: r.type,
        account: r.account,
        quote: r.quote,
        tokens: r.tokens,
        block: r.block,
        ts: ts[r.block] ?? null,
        txHash: r.txHash,
      })),
    });
  } catch {
    return NextResponse.json({ trades: [], volume: 0, tradeCount: 0, quoteSymbol: "ETH", quoteIsNative: true, ethUsd: null });
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
