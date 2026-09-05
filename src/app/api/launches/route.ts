import { NextResponse } from "next/server";
import { isAddress, toEventSelector, verifyMessage, type Address } from "viem";
import { getKv } from "@/lib/kv";
import { indexV2Launches } from "@/lib/pons/readerV2";
import { ponsClient } from "@/lib/pons/reader";
import { tokenAbi as v1TokenAbi } from "@/lib/pons/abis";
import { v2TokenAbi } from "@/lib/pons/abisV2";
import { PONS_V1, PONS_V2 } from "@/lib/pons/registry";
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

// v1-style TokenLaunched topic0 (10-arg event, same as ponsfamily.com). In both
// the v1 and v2 events the launched token is the first indexed arg (topics[1]),
// so matching either topic and reading topics[1] catches every launch shape.
const V1_LAUNCH_TOPIC = PONS_V1.topics.tokenLaunched.toLowerCase();

function isLaunchTopic(t?: string): boolean {
  if (!t) return false;
  const s = t.toLowerCase();
  return s === V2_LAUNCH_TOPIC.toLowerCase() || s === V1_LAUNCH_TOPIC;
}

// Every address that can emit a TokenLaunched event: the v2 factory + router +
// deployer (dev-buy launches route through these) and the v1 factories.
const V2_LAUNCH_EMITTERS = [
  PONS_V2.factory,
  PONS_V2.launchAndBuy,
  PONS_V2.launchDeployer,
  PONS_V1.activeFactory,
  PONS_V1.legacyFactory,
];

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
    if (!isLaunchTopic(topics[0])) continue;
    const token = topicToAddress(topics[1]);
    if (!isAddress(token)) continue;
    const isV2 = (topics[0] ?? "").toLowerCase() === V2_LAUNCH_TOPIC.toLowerCase();
    const curve = isV2 ? topicToAddress(topics[2]) : "";
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
    if (!isLaunchTopic(topics[0])) continue;
    const token = topicToAddress(topics[1]);
    if (!isAddress(token)) continue;
    // topics[2] is the curve only in the v2 event; in the v1 event it is the
    // deployer, so only read a curve when the v2 topic matched.
    const isV2 = (topics[0] ?? "").toLowerCase() === V2_LAUNCH_TOPIC.toLowerCase();
    const maybeCurve = isV2 ? topicToAddress(topics[2]) : "";
    out.push({
      token: token as Address,
      curve: (isAddress(maybeCurve) ? maybeCurve : undefined) as Address | undefined,
      deployer: topicToAddress(topics[isV2 ? 3 : 2]) as Address,
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

interface TokenMeta {
  name: string;
  symbol: string;
  logo: string;
}

/** Token name/symbol/logo from Blockscout (reliable, no RPC). */
async function blockscoutTokenMeta(address: string): Promise<TokenMeta | null> {
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

/**
 * The launched token's logo, read straight from the contract. The Pons v2 art
 * token keeps its logo inside getTokenInfo().tokenLogo; the v1 token exposes a
 * logo() getter. Try v2 first, then v1. Best-effort - returns "" on any miss.
 */
async function onchainLogo(addr: Address): Promise<string> {
  const client = ponsClient();
  try {
    const info = (await client.readContract({
      address: addr,
      abi: v2TokenAbi,
      functionName: "getTokenInfo",
    })) as { tokenLogo?: string };
    if (info?.tokenLogo) return String(info.tokenLogo);
  } catch {
    /* not a v2 art token, or RPC miss - fall through to v1 */
  }
  try {
    const logo = (await client.readContract({
      address: addr,
      abi: v1TokenAbi,
      functionName: "logo",
    })) as string;
    if (logo) return String(logo);
  } catch {
    /* no logo() getter - leave empty */
  }
  return "";
}

/**
 * Token name/symbol/logo read directly from the token contract on-chain. The
 * Pons art token is self-describing (name()/symbol() are standard ERC-20; the
 * logo lives on the contract too), so this resolves brand-new tokens that
 * Blockscout hasn't indexed yet - which is why the feed used to show a bare
 * address + $ + default logo. Best-effort per field; never throws.
 */
async function onchainTokenMeta(address: string): Promise<TokenMeta | null> {
  if (!isAddress(address)) return null;
  const addr = address as Address;
  const client = ponsClient();
  const [name, symbol, logo] = await Promise.all([
    client
      .readContract({ address: addr, abi: v2TokenAbi, functionName: "name" })
      .then((v) => String(v ?? ""))
      .catch(() => ""),
    client
      .readContract({ address: addr, abi: v2TokenAbi, functionName: "symbol" })
      .then((v) => String(v ?? ""))
      .catch(() => ""),
    onchainLogo(addr),
  ]);
  if (!name && !symbol && !logo) return null;
  return { name, symbol, logo };
}

/** Per-token last-good metadata cache key. */
const tokenMetaKey = (addr: string) => `creo:tokenmeta:${addr.toLowerCase()}`;

/**
 * Resolve a token's display metadata: on-chain (the source of truth) first,
 * then Blockscout, then whatever was last cached for this token. Fields are
 * merged independently and the best result is stored per-token, so a name,
 * symbol or logo that resolved once never reverts to a bare address on a later
 * refresh (even if a read momentarily fails). Never throws.
 */
async function resolveTokenMeta(address: string): Promise<TokenMeta> {
  const kv = getKv();
  const key = tokenMetaKey(address);
  const [onchain, blockscout, lastGood] = await Promise.all([
    onchainTokenMeta(address).catch(() => null),
    blockscoutTokenMeta(address).catch(() => null),
    kv ? kv.get<TokenMeta>(key).catch(() => null) : Promise.resolve(null),
  ]);

  const pick = (f: keyof TokenMeta) =>
    onchain?.[f] || blockscout?.[f] || lastGood?.[f] || "";
  const meta: TokenMeta = { name: pick("name"), symbol: pick("symbol"), logo: pick("logo") };

  // Persist as this token's last-good whenever it changed and we know something.
  if (kv && (meta.name || meta.symbol || meta.logo)) {
    const changed =
      !lastGood ||
      lastGood.name !== meta.name ||
      lastGood.symbol !== meta.symbol ||
      lastGood.logo !== meta.logo;
    if (changed) await kv.set(key, meta).catch(() => {});
  }
  return meta;
}

const ONCHAIN_CACHE_KEY = "creo:onchain-feed"; // short TTL fast path
const ONCHAIN_LASTGOOD_KEY = "creo:onchain-feed:lastgood"; // never expires

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

  const metas = await Promise.all(base.map((b) => resolveTokenMeta(b.token)));
  const recs: LaunchRecord[] = base.map((b, i) => {
    const m = metas[i];
    return {
      token: b.token,
      curve: b.curve,
      version: "v2" as const,
      // Never drop a launch just because metadata is momentarily unavailable -
      // that is what caused the feed to flicker. Fall back to a short address.
      name: m.name || `${b.token.slice(0, 6)}…${b.token.slice(-4)}`,
      symbol: m.symbol || "",
      logo: m.logo || "",
      deployer: b.deployer,
      txHash: b.txHash,
      createdAt: b.tsMs || 0,
    };
  });

  const sorted = recs.sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);

  if (sorted.length > 0) {
    if (kv) {
      await kv.set(ONCHAIN_CACHE_KEY, sorted, { ex: 45 }).catch(() => {});
      await kv.set(ONCHAIN_LASTGOOD_KEY, sorted).catch(() => {}); // never let the feed empty out
    }
    return sorted;
  }

  // Fresh build came back empty (RPC/explorer hiccup): serve the last good feed
  // so tokens never blink out on a refresh.
  if (kv) {
    const lastGood = await kv.get<LaunchRecord[]>(ONCHAIN_LASTGOOD_KEY).catch(() => null);
    if (lastGood && Array.isArray(lastGood) && lastGood.length > 0) return lastGood.slice(0, limit);
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
