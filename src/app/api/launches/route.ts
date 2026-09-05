import { NextResponse } from "next/server";
import { isAddress, toEventSelector, verifyMessage, type Address } from "viem";
import { getKv } from "@/lib/kv";
import { indexV2Launches } from "@/lib/pons/readerV2";
import { PONS_V2 } from "@/lib/pons/registry";
import { explorerUrl } from "@/lib/chain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const KEY = "creo:launches";

export interface LaunchRecord {
  token: string;
  curve?: string;
  version: "v1" | "v2";
  name: string;
  symbol: string;
  logo: string;
  twitter?: string;
  telegram?: string;
  website?: string;
  deployer: string;
  txHash: string;
  createdAt: number;
}

/** GET /api/launches?limit=48 - newest CREO launches (from KV, with an
 *  on-chain fallback so launches still show when KV isn't configured). */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? 48), 1), 100);
  const version = searchParams.get("version"); // optional "v1" | "v2"
  const token = searchParams.get("token"); // optional: fetch one record

  const kv = getKv();
  const raw = kv ? ((await kv.lrange<LaunchRecord | string>(KEY, 0, 199)) ?? []) : [];
  const all = raw
    .map((r) => (typeof r === "string" ? safeParse(r) : r))
    .filter((r): r is LaunchRecord => !!r && isAddress(r.token));

  // Diagnostics: /api/launches?debug=1 reports why the feed is (or isn't) empty.
  if (searchParams.get("debug")) {
    return NextResponse.json(await debugDiagnostics(!!kv, all.length));
  }

  // Single-token lookup (used as an image/metadata fallback on the token page).
  if (token && isAddress(token)) {
    const item = all.find((r) => r.token.toLowerCase() === token.toLowerCase()) ?? null;
    return NextResponse.json({ item });
  }

  let items = all
    .filter((r) => (version === "v1" || version === "v2" ? r.version === version : true))
    .slice(0, limit);

  // Fallback: when KV has no records (e.g. not configured, or launches weren't
  // recorded), index recent launches straight from the Pons factories on-chain
  // (v1 + v2) so tokens still appear in the feed. Best-effort; never throws.
  if (items.length === 0) {
    try {
      const onchain = await onchainLaunches(Math.min(limit, 18));
      items = onchain
        .filter((r) => (version === "v1" || version === "v2" ? r.version === version : true))
        .slice(0, limit);
    } catch {
      items = [];
    }
  }

  return NextResponse.json({ items });
}

// v2 TokenLaunched topic0 (types only, in declared order).
const V2_LAUNCH_TOPIC = toEventSelector(
  "TokenLaunched(address,address,address,address,uint256,uint256)"
);

/**
 * Diagnostic report for the feed. Shows KV status and, for every candidate
 * emitter, whether Blockscout is reachable, how many logs it returned, how many
 * matched the launch topic, and a sample of the topic0 values found (so a
 * mismatched event signature or emitter address is obvious).
 */
async function debugDiagnostics(kvConfigured: boolean, kvCount: number) {
  const expectedTopic = V2_LAUNCH_TOPIC.toLowerCase();
  const emitters = await Promise.all(
    V2_LAUNCH_EMITTERS.map(async (addr) => {
      const url = `${explorerUrl}/api/v2/addresses/${addr}/logs`;
      try {
        const res = await fetch(url, {
          cache: "no-store",
          signal: AbortSignal.timeout(9000),
          headers: { accept: "application/json" },
        });
        const body = res.ok ? ((await res.json()) as { items?: Array<{ topics?: string[] }> }) : null;
        const list = Array.isArray(body?.items) ? body!.items! : [];
        const topic0s = Array.from(new Set(list.map((it) => (it.topics ?? [])[0]).filter(Boolean)));
        const matches = list.filter((it) => (it.topics ?? [])[0]?.toLowerCase() === expectedTopic).length;
        return { address: addr, httpStatus: res.status, totalLogs: list.length, launchMatches: matches, topic0sSeen: topic0s.slice(0, 8) };
      } catch (err) {
        return { address: addr, error: err instanceof Error ? err.message : "fetch failed" };
      }
    })
  );

  let onchainCount = 0;
  let onchainError: string | null = null;
  try {
    onchainCount = (await onchainLaunches(18)).length;
  } catch (err) {
    onchainError = err instanceof Error ? err.message : "failed";
  }

  return {
    explorerUrl,
    expectedLaunchTopic: V2_LAUNCH_TOPIC,
    kvConfigured,
    kvCount,
    emitters,
    onchainCount,
    onchainError,
  };
}

interface RawLaunch {
  token: Address;
  curve?: Address;
  deployer: Address;
  txHash: `0x${string}`;
  blockNumber: bigint;
  tsMs: number;
}

/** 32-byte indexed topic → 20-byte address. */
function topicToAddress(t?: string): string {
  return t && t.length >= 42 ? `0x${t.slice(-40)}` : "";
}

// Addresses that can emit the v2 TokenLaunched event: the factory (direct
// launchToken) and the launch-and-buy router / deployer (dev-buy launches route
// through these, so the event may be emitted there instead of the factory).
const V2_LAUNCH_EMITTERS = [PONS_V2.factory, PONS_V2.launchAndBuy, PONS_V2.launchDeployer];

/**
 * Resolve the launched token (and curve) from a transaction's logs via
 * Blockscout, matching the v2 TokenLaunched topic. Server-side and reliable, so
 * recording a launch does not depend on the browser reading the receipt.
 */
async function resolveLaunchFromTx(txHash: string): Promise<{ token: string; curve?: string } | null> {
  const res = await fetch(`${explorerUrl}/api/v2/transactions/${txHash}/logs`, {
    cache: "no-store",
    signal: AbortSignal.timeout(9000),
    headers: { accept: "application/json" },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { items?: Array<{ topics?: string[] }> };
  const items = Array.isArray(data.items) ? data.items : [];
  for (const it of items) {
    const topics = it.topics ?? [];
    if (!topics[0] || topics[0].toLowerCase() !== V2_LAUNCH_TOPIC.toLowerCase()) continue;
    const token = topicToAddress(topics[1]);
    if (!isAddress(token)) continue;
    const curve = topicToAddress(topics[2]);
    return { token, curve: isAddress(curve) ? curve : undefined };
  }
  return null;
}

/** Parse TokenLaunched logs from one Blockscout address-logs response. */
function parseLaunchLogs(
  items: Array<{ topics?: string[]; transaction_hash?: string; block_number?: number; block_timestamp?: string }>
): RawLaunch[] {
  const out: RawLaunch[] = [];
  for (const it of items) {
    const topics = it.topics ?? [];
    if (!topics[0] || topics[0].toLowerCase() !== V2_LAUNCH_TOPIC.toLowerCase()) continue;
    const token = topicToAddress(topics[1]);
    if (!isAddress(token)) continue;
    out.push({
      token: token as Address,
      curve: (isAddress(topicToAddress(topics[2])) ? topicToAddress(topics[2]) : undefined) as Address | undefined,
      deployer: topicToAddress(topics[3]) as Address,
      txHash: (it.transaction_hash ?? "0x") as `0x${string}`,
      blockNumber: BigInt(it.block_number ?? 0),
      tsMs: it.block_timestamp ? Date.parse(it.block_timestamp) : 0,
    });
  }
  return out;
}

/**
 * Recent v2 launches via Blockscout. The public RPC's eth_getLogs is unreliable,
 * but Blockscout serves decoded historical logs reliably (egress works in
 * production). Scans every address that can emit TokenLaunched (factory + router
 * + deployer) so dev-buy launches (routed through launchAndBuy) are included.
 * Returns [] on failure so the caller can fall back to the RPC scan.
 */
async function blockscoutV2Launches(limit: number): Promise<RawLaunch[]> {
  const perAddr = await Promise.all(
    V2_LAUNCH_EMITTERS.map(async (addr) => {
      try {
        const res = await fetch(`${explorerUrl}/api/v2/addresses/${addr}/logs`, {
          cache: "no-store",
          signal: AbortSignal.timeout(9000),
          headers: { accept: "application/json" },
        });
        if (!res.ok) return [] as RawLaunch[];
        const data = (await res.json()) as { items?: Parameters<typeof parseLaunchLogs>[0] };
        return parseLaunchLogs(Array.isArray(data.items) ? data.items : []);
      } catch {
        return [] as RawLaunch[];
      }
    })
  );

  // Merge, dedupe by token (keep the newest), newest first.
  const byToken = new Map<string, RawLaunch>();
  for (const row of perAddr.flat()) {
    const key = row.token.toLowerCase();
    const prev = byToken.get(key);
    if (!prev || row.blockNumber > prev.blockNumber) byToken.set(key, row);
  }
  return [...byToken.values()]
    .sort((a, b) => (b.blockNumber > a.blockNumber ? 1 : b.blockNumber < a.blockNumber ? -1 : 0))
    .slice(0, limit);
}

/** Token name/symbol/logo from Blockscout (reliable, no RPC). */
async function blockscoutTokenMeta(
  address: string
): Promise<{ name: string; symbol: string; logo: string } | null> {
  try {
    const res = await fetch(`${explorerUrl}/api/v2/tokens/${address}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(7000),
      headers: { accept: "application/json" },
    });
    if (!res.ok) return null;
    const d = (await res.json()) as { name?: string; symbol?: string; icon_url?: string };
    return { name: d.name ?? "", symbol: d.symbol ?? "", logo: d.icon_url ?? "" };
  } catch {
    return null;
  }
}

const ONCHAIN_CACHE_KEY = "creo:onchain-feed";

/**
 * Build feed records from recent on-chain Pons v2 launches (Blockscout logs,
 * RPC getLogs as a last resort). Metadata comes from Blockscout too (not the
 * flaky public RPC), and the assembled list is cached briefly in KV, so the feed
 * is STABLE across refreshes instead of flickering when an RPC read fails.
 */
async function onchainLaunches(limit: number): Promise<LaunchRecord[]> {
  const kv = getKv();
  if (kv) {
    const cached = await kv.get<LaunchRecord[]>(ONCHAIN_CACHE_KEY).catch(() => null);
    if (cached && Array.isArray(cached) && cached.length > 0) return cached.slice(0, limit);
  }

  let base = await blockscoutV2Launches(limit).catch(() => []);
  if (base.length === 0) {
    const rpc = await indexV2Launches({ limit }).catch(() => []);
    base = rpc.map((l) => ({
      token: l.token,
      curve: l.curve,
      deployer: l.deployer,
      txHash: l.txHash,
      blockNumber: l.blockNumber,
      tsMs: 0,
    }));
  }

  const metas = await Promise.all(base.map((b) => blockscoutTokenMeta(b.token)));
  const recs: LaunchRecord[] = base.map((b, i) => {
    const m = metas[i];
    return {
      token: b.token,
      curve: b.curve,
      version: "v2" as const,
      // Never drop a launch just because metadata is momentarily unavailable -
      // that is what caused the feed to flicker. Fall back to a short address.
      name: m?.name || `${b.token.slice(0, 6)}…${b.token.slice(-4)}`,
      symbol: m?.symbol || "",
      logo: m?.logo || "",
      deployer: b.deployer,
      txHash: b.txHash,
      createdAt: b.tsMs || 0,
    };
  });

  const sorted = recs.sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
  if (kv && sorted.length > 0) {
    await kv.set(ONCHAIN_CACHE_KEY, sorted, { ex: 45 }).catch(() => {});
  }
  return sorted;
}

/** POST /api/launches - record a launch made through CREO. */
export async function POST(req: Request) {
  const kv = getKv();
  if (!kv) return NextResponse.json({ error: "Storage not configured." }, { status: 503 });

  let body: Partial<LaunchRecord>;
  try {
    body = (await req.json()) as Partial<LaunchRecord>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  // Resolve the token address. The client usually parses it from the receipt,
  // but that relies on the browser reaching the RPC (which can fail). If it's
  // missing, resolve it server-side from the tx's logs via Blockscout using the
  // txHash. If Blockscout hasn't indexed the tx yet, return `pending` so the
  // client can retry - this is how a launch reliably reaches the feed even when
  // the browser can't read the receipt.
  let tokenAddr = body.token && isAddress(body.token) ? (body.token as string) : "";
  let curveAddr = body.curve && isAddress(body.curve) ? (body.curve as string) : "";
  const txHash = String(body.txHash ?? "");
  if (!tokenAddr && /^0x[0-9a-fA-F]{64}$/.test(txHash)) {
    const resolved = await resolveLaunchFromTx(txHash).catch(() => null);
    if (resolved) {
      tokenAddr = resolved.token;
      curveAddr = curveAddr || resolved.curve || "";
    }
  }
  if (!tokenAddr || !isAddress(tokenAddr)) {
    return NextResponse.json({ pending: true }, { status: 202 });
  }

  // De-dupe: skip if this token is already in the feed.
  const existing = (await kv.lrange<LaunchRecord | string>(KEY, 0, 199)) ?? [];
  const already = existing.some((r) => {
    const rec = typeof r === "string" ? safeParse(r) : r;
    return rec?.token?.toLowerCase() === tokenAddr.toLowerCase();
  });
  if (already) return NextResponse.json({ ok: true, deduped: true });

  const record: LaunchRecord = {
    token: tokenAddr,
    curve: curveAddr && isAddress(curveAddr) ? curveAddr : undefined,
    version: body.version === "v1" ? "v1" : "v2",
    name: String(body.name ?? "").slice(0, 80),
    symbol: String(body.symbol ?? "").slice(0, 16),
    logo: String(body.logo ?? "").slice(0, 2000),
    twitter: body.twitter ? String(body.twitter).slice(0, 200) : undefined,
    telegram: body.telegram ? String(body.telegram).slice(0, 200) : undefined,
    website: body.website ? String(body.website).slice(0, 200) : undefined,
    deployer: body.deployer && isAddress(body.deployer) ? body.deployer : "0x0000000000000000000000000000000000000000",
    txHash: String(body.txHash ?? "").slice(0, 80),
    createdAt: Date.now(),
  };

  await kv.lpush(KEY, JSON.stringify(record));
  await kv.ltrim(KEY, 0, 199); // cap the list

  return NextResponse.json({ ok: true });
}

/** The message a creator signs to remove one of their launches from the feed. */
function removeMessage(token: string): string {
  return `Remove ${token.toLowerCase()} from the CREO feed`;
}

/**
 * DELETE /api/launches - remove a launch record from the feed.
 * Body: { token, address, signature }. Authorized only when the signature over
 * removeMessage(token) recovers to the record's deployer (i.e. the creator can
 * remove their own launch). An ADMIN_ADDRESS env can also remove any record.
 */
export async function DELETE(req: Request) {
  const kv = getKv();
  if (!kv) return NextResponse.json({ error: "Storage not configured." }, { status: 503 });

  let body: { token?: string; address?: string; signature?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const { token, address, signature } = body;
  if (!token || !isAddress(token) || !address || !isAddress(address) || !signature) {
    return NextResponse.json({ error: "token, address and signature are required." }, { status: 400 });
  }

  // Verify the signature actually comes from `address`.
  let validSig = false;
  try {
    validSig = await verifyMessage({
      address: address as Address,
      message: removeMessage(token),
      signature: signature as `0x${string}`,
    });
  } catch {
    validSig = false;
  }
  if (!validSig) return NextResponse.json({ error: "Bad signature." }, { status: 401 });

  const admin = (process.env.ADMIN_ADDRESS ?? "").toLowerCase();
  const raw = (await kv.lrange<LaunchRecord | string>(KEY, 0, 999)) ?? [];

  let removed = 0;
  for (const item of raw) {
    const rec = typeof item === "string" ? safeParse(item) : item;
    if (!rec || rec.token.toLowerCase() !== token.toLowerCase()) continue;
    // Authorized if the signer is the record's deployer, or the configured admin.
    const authorized =
      rec.deployer.toLowerCase() === address.toLowerCase() || (admin && admin === address.toLowerCase());
    if (!authorized) return NextResponse.json({ error: "Not your launch." }, { status: 403 });
    await kv.lrem(KEY, 0, item as string);
    removed++;
  }

  return NextResponse.json({ ok: true, removed });
}

function safeParse(s: string): LaunchRecord | null {
  try {
    return JSON.parse(s) as LaunchRecord;
  } catch {
    return null;
  }
}
