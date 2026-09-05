import { NextResponse } from "next/server";
import { isAddress, verifyMessage, type Address } from "viem";
import { getKv } from "@/lib/kv";
import { blockTimestamps, indexV2Launches, readTokenInfoV2 } from "@/lib/pons/readerV2";

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
  // recorded), index recent launches straight from the Pons v2 factory on-chain
  // so tokens still appear in the feed. Best-effort; never throws.
  if (items.length === 0 && version !== "v1") {
    try {
      items = await onchainLaunches(Math.min(limit, 18));
    } catch {
      items = [];
    }
  }

  return NextResponse.json({ items });
}

/** Build feed records from recent on-chain Pons v2 TokenLaunched events. */
async function onchainLaunches(limit: number): Promise<LaunchRecord[]> {
  const launches = await indexV2Launches({ limit });
  const [infos, ts] = await Promise.all([
    Promise.all(launches.map((l) => readTokenInfoV2(l.token).catch(() => null))),
    blockTimestamps(launches.map((l) => Number(l.blockNumber))),
  ]);
  return launches
    .map((l, i) => {
      const info = infos[i];
      const rec: LaunchRecord = {
        token: l.token,
        curve: l.curve,
        version: "v2",
        name: info?.name ?? "",
        symbol: info?.symbol ?? "",
        logo: info?.logo ?? "",
        deployer: l.deployer,
        txHash: l.txHash,
        createdAt: (ts[Number(l.blockNumber)] ?? 0) * 1000,
      };
      return rec;
    })
    .filter((r) => r.name || r.symbol);
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
