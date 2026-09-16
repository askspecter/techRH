import { NextResponse } from "next/server";
import { createPublicClient, erc20Abi, fallback, formatUnits, getAddress, http } from "viem";
import { arcChain } from "@/lib/chain";
import { OFFICIAL_TOKEN } from "@/lib/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/burn → { burned, supply }
 *
 * Total $CREO burned = the dead wallet's on-chain balance. Read server-side
 * (not from the browser, where the public RPC's CORS + flakiness left the
 * figure blank) across a fallback list of Arc RPCs, with a short cache and a
 * last-good fallback so an RPC outage never blanks the number.
 */
const DEAD = getAddress("0x000000000000000000000000000000000000dEaD");
const CREO = getAddress(OFFICIAL_TOKEN.address);

// thirdweb answers eth_call reliably; arc-scan is a backup. A paid RPC set via
// NEXT_PUBLIC_RPC_URL is tried first.
const RPCS = [process.env.NEXT_PUBLIC_RPC_URL, "https://5042.rpc.thirdweb.com", "https://rpc.arc-scan.org"].filter(
  (u): u is string => Boolean(u && u.trim()),
);

const TTL_MS = 30_000;
let lastGood: { burned: number; supply: number } | null = null;
let cachedAt = 0;

export async function GET() {
  if (lastGood && Date.now() - cachedAt < TTL_MS) return NextResponse.json(lastGood);
  try {
    const client = createPublicClient({
      chain: arcChain,
      transport: fallback(RPCS.map((u) => http(u, { timeout: 12_000 })), { rank: false }),
    });
    const [dead, supply, decimals] = await Promise.all([
      client.readContract({ address: CREO, abi: erc20Abi, functionName: "balanceOf", args: [DEAD] }),
      client.readContract({ address: CREO, abi: erc20Abi, functionName: "totalSupply" }),
      client.readContract({ address: CREO, abi: erc20Abi, functionName: "decimals" }),
    ]);
    lastGood = {
      burned: Number(formatUnits(dead as bigint, decimals as number)),
      supply: Number(formatUnits(supply as bigint, decimals as number)),
    };
    cachedAt = Date.now();
    return NextResponse.json(lastGood);
  } catch {
    if (lastGood) return NextResponse.json(lastGood); // serve stale on outage
    return NextResponse.json({ burned: null, supply: null });
  }
}
