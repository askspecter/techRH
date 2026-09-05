import { NextResponse } from "next/server";
import { zeroAddress, type Address } from "viem";
import {
  getCurveState,
  getLaunchedTokenV2,
  indexV2Launches,
  phaseLabel,
  readTokenInfoV2,
} from "@/lib/pons/readerV2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/feed?limit=24
 * A live feed of recent Pons v2 launches, newest first, enriched with token
 * metadata, phase, and bonding-curve progress.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? 24), 1), 48);

  try {
    const launches = await indexV2Launches({ limit });

    const items = await Promise.all(
      launches.map(async (l) => {
        const base = {
          token: l.token,
          curve: l.curve,
          deployer: l.deployer,
          block: Number(l.blockNumber),
          txHash: l.txHash,
        };
        try {
          const [info, record] = await Promise.all([
            readTokenInfoV2(l.token),
            getLaunchedTokenV2(l.token),
          ]);
          let progress: number | null = null;
          if (record.phase === 0 && record.curve && record.curve !== zeroAddress) {
            progress = (await getCurveState(record.curve).catch(() => null))?.progress ?? null;
          }
          return {
            ...base,
            name: info.name,
            symbol: info.symbol,
            logo: info.logo,
            phase: record.phase,
            phaseLabel: phaseLabel(record.phase),
            progress,
          };
        } catch {
          // Enrichment failed (RPC hiccup) - still surface the raw launch.
          return { ...base, name: null, symbol: null, logo: "", phase: null, phaseLabel: "", progress: null };
        }
      })
    );

    return NextResponse.json({ items });
  } catch (err) {
    const raw = err instanceof Error ? err.message : "";
    const message = /allowlist|HTTP request failed|fetch failed|timeout|network/i.test(raw)
      ? "Couldn't reach Robinhood Chain right now - try again in a moment."
      : raw || "Failed to load the feed.";
    return NextResponse.json({ error: message, items: [] }, { status: 502 });
  }
}
