import { NextResponse } from "next/server";
import { isAddress, zeroAddress, type Address } from "viem";
import { getCurveState, getLaunchedTokenV2, phaseLabel, readTokenInfoV2 } from "@/lib/pons/readerV2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v2/token?address=0x...
 * Live post-launch state for a Pons v2 token: metadata, phase, and (while on
 * the curve) reserves + progress + fee rates for the trade widget.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const address = searchParams.get("address");
  if (!address || !isAddress(address)) {
    return NextResponse.json({ error: "The `address` param is not a valid address." }, { status: 400 });
  }
  const token = address as Address;

  try {
    const [record, info] = await Promise.all([getLaunchedTokenV2(token), readTokenInfoV2(token)]);
    if (!record.exists) {
      return NextResponse.json({ error: "No Pons v2 launch found for this token." }, { status: 404 });
    }

    // Curve state only matters while still on the curve (phase 0).
    let curve: Awaited<ReturnType<typeof getCurveState>> | null = null;
    if (record.phase === 0 && record.curve && record.curve !== zeroAddress) {
      curve = await getCurveState(record.curve);
    }

    return NextResponse.json({
      token,
      name: info.name,
      symbol: info.symbol,
      decimals: info.decimals,
      logo: info.logo,
      description: info.description,
      deployer: record.deployer,
      curveAddress: record.curve,
      pairToken: record.pairToken,
      phase: record.phase,
      phaseLabel: phaseLabel(record.phase),
      buybackEnabled: record.buybackEnabled,
      creatorFeeRecipient: record.creatorFeeRecipient,
      curve: curve
        ? {
            quoteReserve: curve.quoteReserve.toString(),
            tokenReserve: curve.tokenReserve.toString(),
            realQuoteReserve: curve.realQuoteReserve.toString(),
            graduationThreshold: curve.graduationThreshold.toString(),
            sellableTokens: curve.sellableTokens.toString(),
            readyToGraduate: curve.readyToGraduate,
            graduated: curve.graduated,
            spotPrice: curve.spotPrice,
            progress: curve.progress,
            feeBps: curve.feeBps.toString(),
            creatorTaxBps: curve.creatorTaxBps.toString(),
          }
        : null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to read the v2 token from chain.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
