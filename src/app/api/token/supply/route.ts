import { NextResponse } from "next/server";
import { isAddress, type Address } from "viem";
import { tokenSupplyStats } from "@/lib/pons/readerV2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/token/supply?address=0x...&decimals=18
 * Total supply, burned (dead + zero address), and circulating for any ERC-20
 * on the chain, in whole token units. Degrades to nulls if the chain is
 * unreachable.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const address = searchParams.get("address");
  const decimals = Number(searchParams.get("decimals") ?? "18") || 18;
  if (!address || !isAddress(address)) {
    return NextResponse.json({ error: "Invalid token address." }, { status: 400 });
  }

  try {
    const stats = await tokenSupplyStats(address as Address, decimals);
    return NextResponse.json(stats);
  } catch {
    return NextResponse.json({ totalSupply: null, burned: null, circulating: null });
  }
}
