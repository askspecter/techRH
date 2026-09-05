import { NextResponse } from "next/server";
import { isAddress, toEventSelector, verifyMessage, type Address } from "viem";
import { getKv } from "@/lib/kv";
import { blockTimestamps, indexV2Launches, readTokenInfoV2 } from "@/lib/pons/readerV2";
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

/**
 * Recent v2 launches from the factory's logs via Blockscout. The public RPC's
 * eth_getLogs is unreliable, but Blockscout serves decoded historical logs
 * reliably (and its egress works in production). Returns [] on any failure so
 * the caller can fall back to the RPC scan.
 */
async function blockscoutV2Launches(limit: number): Promise<RawLaunch[]> {
  const res = await fetch(`${explorerUrl}/api/v2/addresses/${PONS_V2.factory}/logs`, {
    cache: "no-store",
    signal: AbortSignal.timeout(9000),
    headers: { accept: "application/json" },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    items?: Array<{ topics?: string[]; transaction_hash?: string; block_number?: number; block_timestamp?: string }>;
  };
  const items = Array.isArray(data.items) ? data.items : [];
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
    if (out.length >= limit) break;
  }
  return out;
}

/** Build feed records from recent on-chain Pons v2 launches (Blockscout first,
 *  RPC getLogs as a fallback), enriched with token metadata. */
async function onchainLaunches(limit: number): Promise<LaunchRecord[]> {
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

  const infos = await Promise.all(base.map((b) => readTokenInfoV2(b.token).catch(() => null)));
  const needTs = base.filter((b) => !b.tsMs).map((b) => Number(b.blockNumber));
  const ts = needTs.length ? await blockTimestamps(needTs).catch(() => ({}) as Record<number, number>) : {};

  const recs: LaunchRecord[] = [];
  base.forEach((b, i) => {
    const info = infos[i];
    if (!info?.symbol && !info?.name) return;
    recs.push({
      token: b.token,
      curve: b.curve,
      version: "v2",
      name: info?.name ?? "",
      symbol: info?.symbol ?? "",
      logo: info?.logo ?? "",
      deployer: b.deployer,
      txHash: b.txHash,
      createdAt: b.tsMs || (ts[Number(b.blockNumber)] ?? 0) * 1000,
    });
  });

  return recs.sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
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

  if (!body.token || !isAddress(body.token)) {
    return NextResponse.json({ error: "Missing/invalid token address." }, { status: 400 });
  }

  const record: LaunchRecord = {
    token: body.token,
    curve: body.curve && isAddress(body.curve) ? body.curve : undefined,
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
