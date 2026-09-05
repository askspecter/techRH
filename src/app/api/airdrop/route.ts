import { NextResponse } from "next/server";
import { isAddress } from "viem";
import { getKv } from "@/lib/kv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Airdrop allocation lookup.
 *
 * The snapshot (v1 holders + negative-PnL wallets) is computed off-chain and
 * uploaded to KV as a hash `creo:airdrop` of { addressLowercase: amount }, with
 * a `creo:airdrop:live` flag flipped on once it is final. Until then the page
 * shows "snapshot pending" - we never fabricate an allocation.
 */
const HASH = "creo:airdrop";
const LIVE = "creo:airdrop:live";

export async function GET(req: Request) {
  const kv = getKv();
  const { searchParams } = new URL(req.url);
  const address = searchParams.get("address");

  const live = kv ? Boolean(await kv.get(LIVE)) : false;

  if (!address || !isAddress(address)) {
    return NextResponse.json({ live, eligible: false });
  }

  let amount: string | null = null;
  if (kv) {
    const raw = await kv.hget<string | number>(HASH, address.toLowerCase());
    if (raw !== null && raw !== undefined) amount = String(raw);
  }

  return NextResponse.json({
    live,
    address,
    eligible: amount !== null,
    amount,
  });
}

/**
 * POST - upload the snapshot (admin only). Body:
 * { secret, allocations?: { [addr]: amount }, live?: boolean }
 * Requires AIRDROP_ADMIN_SECRET to be set on the server.
 */
export async function POST(req: Request) {
  const kv = getKv();
  if (!kv) return NextResponse.json({ error: "Storage not configured." }, { status: 503 });

  const secret = process.env.AIRDROP_ADMIN_SECRET;
  if (!secret) return NextResponse.json({ error: "Admin uploads are disabled." }, { status: 403 });

  let body: { secret?: string; allocations?: Record<string, string | number>; live?: boolean };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (body.secret !== secret) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  let written = 0;
  if (body.allocations && typeof body.allocations === "object") {
    const clean: Record<string, string> = {};
    for (const [addr, amt] of Object.entries(body.allocations)) {
      if (isAddress(addr)) {
        clean[addr.toLowerCase()] = String(amt);
        written++;
      }
    }
    if (written > 0) await kv.hset(HASH, clean);
  }
  if (typeof body.live === "boolean") await kv.set(LIVE, body.live);

  return NextResponse.json({ ok: true, written, live: body.live });
}
