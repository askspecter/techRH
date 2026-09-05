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

const DEFAULT_CHAIN_ID = 4663;
const parsedChainId = Number(env("NEXT_PUBLIC_CHAIN_ID", String(DEFAULT_CHAIN_ID)));
const CHAIN_ID =
  Number.isInteger(parsedChainId) && parsedChainId > 0 ? parsedChainId : DEFAULT_CHAIN_ID;

const RPC_URL = env("NEXT_PUBLIC_RPC_URL", "https://rpc.mainnet.chain.robinhood.com");
const EXPLORER_URL = env("NEXT_PUBLIC_EXPLORER_URL", "https://robinhoodchain.blockscout.com");

/**
 * Robinhood Chain - verified network parameters.
 *  - Chain ID: 4663
 *  - Native currency: ETH
 *  - L2 built on Arbitrum Orbit
 *
 * Sources: robinhoodchain.wiki, Chainstack docs, MetaMask add-network guides.
 */
export const robinhoodChain = defineChain({
  id: CHAIN_ID,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: [RPC_URL] },
  },
  blockExplorers: {
    default: { name: "Blockscout", url: EXPLORER_URL },
  },
});

export const explorerUrl = EXPLORER_URL;

export function explorerTx(hash: string): string {
  return `${explorerUrl}/tx/${hash}`;
}

export function explorerToken(address: string): string {
  return `${explorerUrl}/token/${address}`;
}
