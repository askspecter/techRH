import { NextResponse } from "next/server";
import { isAddress } from "viem";
import { explorerUrl } from "@/lib/chain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOP = 15;

/**
 * GET /api/token/holders?address=0x...
 * Top token holders and each one's share of supply, read from the chain's
 * Blockscout instance (works for any ERC-20 on the chain). Returns [] if the
 * explorer API is unavailable so the UI degrades gracefully.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const address = searchParams.get("address");
  if (!address || !isAddress(address)) {
    return NextResponse.json({ error: "Invalid token address.", holders: [] }, { status: 400 });
  }

  try {
    const base = `${explorerUrl}/api/v2/tokens/${address}`;
    const [tokenRes, holdersRes] = await Promise.all([
      fetch(base, { cache: "no-store" }),
      fetch(`${base}/holders`, { cache: "no-store" }),
    ]);

    const tokenData = tokenRes.ok ? await tokenRes.json() : {};
    const holdersData = holdersRes.ok ? await holdersRes.json() : { items: [] };

    const totalSupply = Number(tokenData?.total_supply ?? 0);
    const items: unknown[] = Array.isArray(holdersData?.items) ? holdersData.items : [];

    const holders = items.slice(0, TOP).map((raw) => {
      const it = raw as { address?: { hash?: string }; value?: string };
      const hash = it.address?.hash ?? "";
      const value = Number(it.value ?? 0);
      const share = totalSupply > 0 ? value / totalSupply : 0;
      return { address: hash, share };
    });

    return NextResponse.json({ holders, totalSupply });
  } catch {
    return NextResponse.json({ holders: [], totalSupply: 0 });
  }
}
