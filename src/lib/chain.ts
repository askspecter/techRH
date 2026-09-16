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

// Arc's public RPC (used by o1's own bot, no key). Override with a paid RPC via
// NEXT_PUBLIC_RPC_URL in production.
const RPC_URL = env("NEXT_PUBLIC_RPC_URL", "https://rpc.arc-scan.org");
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
 * imports keep working without a churn-heavy rename.
 */
export const robinhoodChain = arcChain;

export const explorerUrl = EXPLORER_URL;

export function explorerTx(hash: string): string {
  return `${explorerUrl}/tx/${hash}`;
}

export function explorerToken(address: string): string {
  return `${explorerUrl}/token/${address}`;
}
