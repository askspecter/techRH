import { defineChain } from "viem";

// Read an env var but treat a set-but-empty value ("") the same as unset. `??`
// only catches null/undefined, so an empty Vercel env var would otherwise slip
// through - and `Number("")` is 0, which produces an invalid chain id, a broken
// wagmi client, and the "undefined is not an object (evaluating 'e.uid')" crash
// in RainbowKit. This guards every network value against that.
function env(name: string, fallback: string): string {
  const v = process.env[name as keyof NodeJS.ProcessEnv] as string | undefined;
  return v && v.trim() ? v.trim() : fallback;
}

const DEFAULT_CHAIN_ID = 5042; // Arc mainnet (Circle)
const parsedChainId = Number(env("NEXT_PUBLIC_CHAIN_ID", String(DEFAULT_CHAIN_ID)));
const CHAIN_ID =
  Number.isInteger(parsedChainId) && parsedChainId > 0 ? parsedChainId : DEFAULT_CHAIN_ID;

// Arc public RPC. drpc answers reads (eth_call) and broadcasts reliably;
// rpc.arc-scan.org fails eth_call, which left on-chain reads (e.g. the burn
// total) stale. Override with a paid RPC via NEXT_PUBLIC_RPC_URL in production.
const RPC_URL = env("NEXT_PUBLIC_RPC_URL", "https://arc.drpc.org");
const EXPLORER_URL = env("NEXT_PUBLIC_EXPLORER_URL", "https://arc-scan.org");

/**
 * Arc mainnet (Circle) - the chain the o1 launchpad runs on.
 *  - Chain ID: 5042
 *  - Native gas currency: USDC (18-decimal native units; the ERC-20 view is
 *    6 decimals). Everything the app denominates in "native" (launch fee, gas)
 *    is USDC here, which is why the native symbol is USDC, not ETH.
 *  - Uniswap v4 pools.
 *
 * Source: docs.o1.exchange/launchpad/reference and o1's production config.
 */
export const arcChain = defineChain({
  id: CHAIN_ID,
  name: "Arc",
  nativeCurrency: { name: "USD Coin", symbol: "USDC", decimals: 18 },
  rpcUrls: {
    default: { http: [RPC_URL] },
  },
  blockExplorers: {
    default: { name: "Arcscan", url: EXPLORER_URL },
  },
});

/**
 * Backwards-compatible alias. The app was originally wired to a chain exported
 * as `robinhoodChain`; it now points at Arc. Kept so the many `robinhoodChain`
 * imports keep working without a churn-heavy rename — this is the app's PRIMARY
 * chain (Arc), used by the wallet/read layer everywhere.
 */
export const robinhoodChain = arcChain;

// ── Second launch target: the real Robinhood Chain ──────────────────────────
// The launch studio offers two deploy targets — Arc (o1 launchpad, USDC) and
// Robinhood (Pons bonding curve, ETH). This is the ACTUAL Robinhood Chain
// (chain 4663, ETH), a distinct network from Arc, used only by the Robinhood
// launch path. It is intentionally separate from `robinhoodChain` above (which
// is the Arc alias) so the primary Arc wiring is untouched.
const RH_DEFAULT_CHAIN_ID = 4663; // Robinhood Chain (Arbitrum Orbit L2)
const rhParsedChainId = Number(env("NEXT_PUBLIC_RH_CHAIN_ID", String(RH_DEFAULT_CHAIN_ID)));
const RH_CHAIN_ID =
  Number.isInteger(rhParsedChainId) && rhParsedChainId > 0 ? rhParsedChainId : RH_DEFAULT_CHAIN_ID;
const RH_RPC_URL = env("NEXT_PUBLIC_RH_RPC_URL", "https://rpc.mainnet.chain.robinhood.com");
export const rhExplorerUrl = env("NEXT_PUBLIC_RH_EXPLORER_URL", "https://robinhoodchain.blockscout.com");

/**
 * Robinhood Chain — the ETH-denominated network the Pons bonding-curve
 * launchpad runs on.
 *  - Chain ID: 4663
 *  - Native currency: ETH
 *  - L2 built on Arbitrum Orbit
 */
export const rhLaunchChain = defineChain({
  id: RH_CHAIN_ID,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: [RH_RPC_URL] },
  },
  blockExplorers: {
    default: { name: "Blockscout", url: rhExplorerUrl },
  },
});

export const explorerUrl = EXPLORER_URL;

export function explorerTx(hash: string): string {
  return `${explorerUrl}/tx/${hash}`;
}

export function explorerToken(address: string): string {
  return `${explorerUrl}/token/${address}`;
}

/** Explorer tx URL for a specific chain id (Arc vs Robinhood launch targets). */
export function explorerTxForChain(chainId: number, hash: string): string {
  const base = chainId === rhLaunchChain.id ? rhExplorerUrl : explorerUrl;
  return `${base}/tx/${hash}`;
}
