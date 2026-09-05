import type { Address } from "viem";
import { ponsClient } from "./reader";
import { getCurveState, getQuoteMeta } from "./readerV2";
import { v2CurveBuyEvent, v2CurveSellEvent, v2TokenAbi } from "./abisV2";

/**
 * Lightweight per-token market stats for the explorer grid:
 *  - marketCapUsd: spot price on the bonding curve × total supply, in USD.
 *  - volumeUsd:    cumulative quote traded through the curve (buys + sells).
 *
 * Both are best-effort and USD is only available when the quote asset is native
 * ETH; anything unavailable comes back as null so the UI shows "-".
 */
export interface TokenStats {
  marketCapUsd: number | null;
  volumeUsd: number | null;
}

export async function getEthUsd(): Promise<number | null> {
  try {
    const res = await fetch("https://coins.llama.fi/prices/current/coingecko:ethereum", {
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { coins?: Record<string, { price?: number }> };
    return data.coins?.["coingecko:ethereum"]?.price ?? null;
  } catch {
    return null;
  }
}

/** Sum the quote in/out of every CurveBuy/CurveSell (bounded, chunked scan). */
async function curveVolumeQuote(curve: Address, quoteDecimals: number): Promise<number> {
  const client = ponsClient();
  const latest = await client.getBlockNumber();
  const lookback = 250_000n;
  const chunk = 10_000n;
  const start = latest > lookback ? latest - lookback : 0n;
  const div = 10 ** quoteDecimals;
  let total = 0;

  for (let from = start; from <= latest; from += chunk) {
    const to = from + chunk - 1n > latest ? latest : from + chunk - 1n;
    const [buys, sells] = await Promise.all([
      client.getLogs({ address: curve, event: v2CurveBuyEvent, fromBlock: from, toBlock: to }),
      client.getLogs({ address: curve, event: v2CurveSellEvent, fromBlock: from, toBlock: to }),
    ]);
    for (const log of buys) {
      const q = log.args.quoteIn;
      if (q != null) total += Number(q) / div;
    }
    for (const log of sells) {
      const q = log.args.quoteOut;
      if (q != null) total += Number(q) / div;
    }
    if (from === latest) break;
  }
  return total;
}

/**
 * Compute stats for a single v2 (bonding-curve) token. Returns nulls for any
 * piece that can't be read, and never throws.
 */
export async function getTokenStatsV2(token: Address, curve: Address, ethUsd: number | null): Promise<TokenStats> {
  try {
    const client = ponsClient();
    const [curveState, meta, totalSupplyRaw, decimals] = await Promise.all([
      getCurveState(curve),
      getQuoteMeta(curve),
      client.readContract({ address: token, abi: v2TokenAbi, functionName: "totalSupply" }) as Promise<bigint>,
      client.readContract({ address: token, abi: v2TokenAbi, functionName: "decimals" }) as Promise<number>,
    ]);

    const supply = Number(totalSupplyRaw) / 10 ** Number(decimals);
    const mcapQuote = curveState.spotPrice * supply;
    const usd = meta.isNative ? ethUsd : null;

    let volumeQuote = 0;
    try {
      volumeQuote = await curveVolumeQuote(curve, meta.decimals);
    } catch {
      volumeQuote = 0;
    }

    return {
      marketCapUsd: usd != null && Number.isFinite(mcapQuote) ? mcapQuote * usd : null,
      volumeUsd: usd != null && Number.isFinite(volumeQuote) ? volumeQuote * usd : null,
    };
  } catch {
    return { marketCapUsd: null, volumeUsd: null };
  }
}
