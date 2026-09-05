import { NextResponse } from "next/server";
import { isAddress, type Address } from "viem";
import { getKv } from "@/lib/kv";
import { getEthUsd, getTokenStatsV2, type TokenStats } from "@/lib/pons/stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface StatsInput {
  token: string;
  curve?: string;
  version?: "v1" | "v2";
}

const CACHE_TTL = 120; // seconds
const MAX_TOKENS = 24;

/**
 * POST /api/launches/stats  { tokens: [{ token, curve, version }] }
 * → { stats: { [token]: { marketCapUsd, volumeUsd } } }
 *
 * On-chain reads are cached per token in KV for a short window so the explorer
 * grid stays cheap. Only v2 (bonding-curve) tokens are computed; everything else
 * (and any read failure) returns nulls, which the UI renders as "—".
 */
export async function POST(req: Request) {
  let body: { tokens?: StatsInput[] };
  try {
    body = (await req.json()) as { tokens?: StatsInput[] };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const inputs = (body.tokens ?? [])
    .filter((t) => t && isAddress(t.token))
    .slice(0, MAX_TOKENS);
  if (inputs.length === 0) return NextResponse.json({ stats: {} });

  const kv = getKv();
  const stats: Record<string, TokenStats> = {};

  // Serve from cache where possible.
  const misses: StatsInput[] = [];
  await Promise.all(
    inputs.map(async (input) => {
      const key = `creo:stats:${input.token.toLowerCase()}`;
      if (kv) {
        const cached = (await kv.get<TokenStats>(key).catch(() => null)) ?? null;
        if (cached) {
          stats[input.token] = cached;
          return;
        }
      }
      misses.push(input);
    })
  );

  // Compute misses (share one ETH/USD lookup across the batch).
  if (misses.length > 0) {
    const ethUsd = await getEthUsd();
    await Promise.all(
      misses.map(async (input) => {
        let s: TokenStats = { marketCapUsd: null, volumeUsd: null };
        if (input.version !== "v1" && input.curve && isAddress(input.curve)) {
          s = await getTokenStatsV2(input.token as Address, input.curve as Address, ethUsd);
        }
        stats[input.token] = s;
        if (kv) {
          await kv
            .set(`creo:stats:${input.token.toLowerCase()}`, s, { ex: CACHE_TTL })
            .catch(() => {});
        }
      })
    );
  }

  return NextResponse.json({ stats });
}
