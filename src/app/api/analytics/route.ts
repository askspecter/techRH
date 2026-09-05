import { NextResponse } from "next/server";
import { isAddress } from "viem";
import { getKv } from "@/lib/kv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const KEY = "creo:launches";
const DAYS = 30;

interface LaunchRecord {
  token: string;
  version: "v1" | "v2";
  deployer: string;
  createdAt: number;
}

interface Metrics {
  launches: number | null;
  uniqueDevs: number | null;
  volumeUsd: number | null;
  tradesCount: number | null;
  protocolRevenueUsd: number | null;
  creatorEarningsUsd: number | null;
}

/**
 * GET /api/analytics
 * Launches + unique devs are indexed from CREO's own KV launch records. When a
 * Dune data source is configured (DUNE_API_KEY + query ids), volume, trades and
 * revenue are filled from Dune; otherwise they stay null and the UI shows "-".
 */
export async function GET() {
  const kv = getKv();
  const now = Date.now();
  const dayMs = 86_400_000;

  let all: LaunchRecord[] = [];
  if (kv) {
    const raw = (await kv.lrange<LaunchRecord | string>(KEY, 0, 999).catch(() => [])) ?? [];
    all = raw
      .map((r) => (typeof r === "string" ? safeParse(r) : r))
      .filter((r): r is LaunchRecord => !!r && isAddress(r.token));
  }

  // Daily launches histogram (oldest → newest) from KV.
  const startOfToday = Math.floor(now / dayMs) * dayMs;
  const buckets = new Array(DAYS).fill(0) as number[];
  for (const r of all) {
    const idx = DAYS - 1 - Math.round((startOfToday - Math.floor((r.createdAt ?? 0) / dayMs) * dayMs) / dayMs);
    if (idx >= 0 && idx < DAYS) buckets[idx] += 1;
  }
  let series = buckets.map((count, i) => ({ ts: startOfToday - (DAYS - 1 - i) * dayMs, count }));

  const launches24h = all.filter((r) => now - (r.createdAt ?? 0) < dayMs).length;
  const devs = (rs: LaunchRecord[]) =>
    new Set(rs.map((r) => r.deployer?.toLowerCase()).filter(Boolean)).size;

  const allTime: Metrics = {
    launches: all.length,
    uniqueDevs: devs(all),
    volumeUsd: null,
    tradesCount: null,
    protocolRevenueUsd: null,
    creatorEarningsUsd: null,
  };
  const day: Metrics = {
    launches: launches24h,
    uniqueDevs: devs(all.filter((r) => now - (r.createdAt ?? 0) < dayMs)),
    volumeUsd: null,
    tradesCount: null,
    protocolRevenueUsd: null,
    creatorEarningsUsd: null,
  };

  // Optional Dune enrichment (best-effort; never breaks the response).
  let dune = false;
  const duneKey = process.env.DUNE_API_KEY;
  if (duneKey) {
    const [allRow, dayRow, seriesRows] = await Promise.all([
      duneOneRow(duneKey, process.env.DUNE_QUERY_ALLTIME),
      duneOneRow(duneKey, process.env.DUNE_QUERY_24H),
      duneRows(duneKey, process.env.DUNE_QUERY_SERIES),
    ]);
    if (allRow) {
      mergeMetrics(allTime, allRow);
      dune = true;
    }
    if (dayRow) {
      mergeMetrics(day, dayRow);
      dune = true;
    }
    if (seriesRows && seriesRows.length) {
      series = seriesRows
        .map((r) => ({
          ts: Date.parse(String(pick(r, ["day", "date", "ts", "period"]) ?? "")) || 0,
          count: num(pick(r, ["launches", "count", "token_launches"])) ?? 0,
        }))
        .filter((s) => s.ts > 0)
        .slice(-DAYS);
      dune = true;
    }
  }

  return NextResponse.json({ configured: !!kv, dune, updatedAt: now, allTime, day, series });
}

/* ── Dune helpers ─────────────────────────────────────────────────────────── */

async function duneRows(key: string, queryId?: string): Promise<Record<string, unknown>[] | null> {
  if (!queryId) return null;
  try {
    const res = await fetch(`https://api.dune.com/api/v1/query/${queryId}/results?limit=1000`, {
      headers: { "X-Dune-Api-Key": key },
      // don't let a slow query hang the page
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { result?: { rows?: Record<string, unknown>[] } };
    return data.result?.rows ?? null;
  } catch {
    return null;
  }
}

async function duneOneRow(key: string, queryId?: string): Promise<Record<string, unknown> | null> {
  const rows = await duneRows(key, queryId);
  return rows && rows.length ? rows[0] : null;
}

function mergeMetrics(m: Metrics, row: Record<string, unknown>) {
  const v = {
    launches: num(pick(row, ["launches", "token_launches"])),
    uniqueDevs: num(pick(row, ["unique_devs", "devs", "unique_token_devs"])),
    volumeUsd: num(pick(row, ["volume_usd", "volume", "trading_volume_usd"])),
    tradesCount: num(pick(row, ["trades", "trades_count", "trade_count"])),
    protocolRevenueUsd: num(pick(row, ["protocol_revenue_usd", "protocol_revenue", "revenue_usd"])),
    creatorEarningsUsd: num(pick(row, ["creator_earnings_usd", "creator_earnings"])),
  };
  for (const k of Object.keys(v) as (keyof Metrics)[]) {
    if (v[k] !== null && v[k] !== undefined) m[k] = v[k]!;
  }
}

function pick(row: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) if (k in row && row[k] != null) return row[k];
  return undefined;
}
function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : null;
}
function safeParse(s: string): LaunchRecord | null {
  try {
    return JSON.parse(s) as LaunchRecord;
  } catch {
    return null;
  }
}
