import { NextResponse } from "next/server";
import { isAddress, zeroAddress, type Address } from "viem";
import { canLaunch, launchFee, previewLaunchEconomics } from "@/lib/pons/readerV2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v2/prepare?configId=0&pairToken=0x..&account=0x..
 * Server-side pre-launch reads for a v2 deploy: the pinned economics hash, the
 * live launch fee, and the whitelist gate. These run on the server so the deploy
 * flow does not depend on the browser reaching the public RPC (which can fail
 * with CORS / "Load failed"). The actual launch tx is still signed by the wallet.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const configId = BigInt(Number(searchParams.get("configId") ?? 0) || 0);
  const pairRaw = searchParams.get("pairToken");
  const pairToken = (pairRaw && isAddress(pairRaw) ? pairRaw : zeroAddress) as Address;
  const account = searchParams.get("account");

  try {
    const [expectedEconomics, fee, allowed] = await Promise.all([
      previewLaunchEconomics(configId, pairToken),
      launchFee(),
      account && isAddress(account) ? canLaunch(account as Address).catch(() => null) : Promise.resolve(null),
    ]);
    return NextResponse.json({ expectedEconomics, launchFee: fee.toString(), canLaunch: allowed });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to read launch economics.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
