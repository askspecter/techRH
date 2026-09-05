import { NextResponse } from "next/server";
import { isAddress, type Address } from "viem";
import {
  getFeeSplit,
  getGraduationStatus,
  getLaunchedToken,
  getPriceInWeth,
  readTokenState,
} from "@/lib/pons/reader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/token?address=0x...
 * Live, authoritative state for a Pons v1 token, read straight from chain:
 * metadata, launch params, graduation progress, price (in WETH), fee split.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const address = searchParams.get("address");

  if (!address || !isAddress(address)) {
    return NextResponse.json({ error: "The `address` param is not a valid address." }, { status: 400 });
  }
  const token = address as Address;

  try {
    const [state, launched, graduation, fees] = await Promise.all([
      readTokenState(token),
      getLaunchedToken(token),
      getGraduationStatus(token),
      getFeeSplit(token),
    ]);

    let priceInWeth: number | null = null;
    if (state.pool && state.pool !== "0x0000000000000000000000000000000000000000") {
      priceInWeth = await getPriceInWeth(state.pool, launched.isToken0);
    }

    const supplyTokens = Number(launched.supply) / 1e18;
    const ethUsd = await getEthUsd();
    const priceUsd = priceInWeth !== null && ethUsd !== null ? priceInWeth * ethUsd : null;

    return NextResponse.json({
      token,
      name: state.name,
      symbol: state.symbol,
      decimals: state.decimals,
      logo: state.logo,
      description: state.description,
      pool: state.pool,
      isToken0: launched.isToken0,
      pairedToken: launched.pairedToken,
      poolFee: launched.poolFee,
      deployer: launched.deployer,
      supply: supplyTokens,
      graduation: {
        graduated: graduation.graduated,
        progress: graduation.progress,
      },
      price: {
        inWeth: priceInWeth,
        usd: priceUsd,
        marketCapWeth: priceInWeth !== null ? priceInWeth * supplyTokens : null,
        marketCapUsd: priceUsd !== null ? priceUsd * supplyTokens : null,
        ethUsd,
      },
      fees,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to read the token from chain.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

/** ETH/USD from DeFiLlama (same source the Pons interface uses). */
async function getEthUsd(): Promise<number | null> {
  try {
    const res = await fetch("https://coins.llama.fi/prices/current/coingecko:ethereum", {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { coins?: Record<string, { price?: number }> };
    return data.coins?.["coingecko:ethereum"]?.price ?? null;
  } catch {
    return null;
  }
}
