import { NextResponse } from "next/server";
import { createPublicClient, fallback, getAddress, http } from "viem";
import { arcChain } from "@/lib/chain";
import { ARC } from "@/lib/o1/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/o1/quotes → { quotes: [{ symbol, address, decimals, note, registered }] }
 *
 * Which paired assets the o1 Arc factory currently accepts. Each candidate's
 * `quoteConfig(addr).registered` is read live, so a newly-unlocked pair (e.g.
 * Circle's cirBTC) turns on automatically once o1 registers it on-chain, and
 * an unregistered one is reported locked instead of letting a launch revert.
 */
const quoteConfigAbi = [
  {
    type: "function",
    name: "quoteConfig",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [
      { name: "registered", type: "bool" },
      { name: "quoteDecimals", type: "uint8" },
      { name: "startTickToken0Frame", type: "int24" },
    ],
  },
] as const;

const RPCS = [
  process.env.NEXT_PUBLIC_RPC_URL,
  "https://arc.drpc.org",
  "https://arc.gateway.tenderly.co",
  "https://rpc.mainnet.arc.io",
  "https://5042.rpc.thirdweb.com",
].filter((u): u is string => Boolean(u && u.trim()));

const TTL_MS = 60_000;
let cache: unknown = null;
let cachedAt = 0;

export async function GET() {
  if (cache && Date.now() - cachedAt < TTL_MS) return NextResponse.json(cache);
  const factory = getAddress(ARC.contracts.factory);
  const client = createPublicClient({ chain: arcChain, transport: fallback(RPCS.map((u) => http(u, { timeout: 10_000 })), { rank: false }) });

  const quotes = await Promise.all(
    ARC.quoteCandidates.map(async (q) => {
      const address = getAddress(q.address);
      try {
        const c = await client.readContract({ address: factory, abi: quoteConfigAbi, functionName: "quoteConfig", args: [address] });
        return { symbol: q.symbol, address, note: q.note, registered: Boolean(c[0]), decimals: Number(c[1]) || q.decimals };
      } catch {
        return { symbol: q.symbol, address, note: q.note, registered: false, decimals: q.decimals };
      }
    }),
  );

  const payload = { quotes };
  cache = payload;
  cachedAt = Date.now();
  return NextResponse.json(payload);
}
