import { NextResponse } from "next/server";
import { getAddress, isAddress, type Address } from "viem";
import { checkPairToken } from "@/lib/pons/readerV2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v2/pair-check?address=0x...
 * Validate a pasted token address as a v2 pair/quote asset: returns the token's
 * symbol/name/decimals and whether the Pons factory approves it. An un-approved
 * token would revert at launch, so the UI blocks selecting it.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const address = searchParams.get("address");
  if (!address || !isAddress(address)) {
    return NextResponse.json({ error: "Enter a valid token address." }, { status: 400 });
  }

  try {
    const info = await checkPairToken(getAddress(address) as Address);
    return NextResponse.json({ address: getAddress(address), ...info });
  } catch {
    return NextResponse.json({ error: "Couldn't read this token from chain." }, { status: 502 });
  }
}
