/** Which Pons launch model the creator wants to use. */
export type PonsVersion = "v1" | "v2";

/**
 * Quote assets. On Arc (o1 launchpad) the only registered quote is USDC, which
 * matches Arc's stable-settlement focus. The older tickers are retained in the
 * union so historical data and the AI schema keep type-checking.
 */
export type QuoteAsset = "USDC" | "ETH" | "USDG" | "NVDA" | "AAPL" | "HOOD";

export const V1_QUOTE_ASSETS: QuoteAsset[] = ["USDC"];
export const V2_QUOTE_ASSETS: QuoteAsset[] = ["USDC"];

/** The user-facing form that feeds a launch, regardless of version. */
export interface LaunchInput {
  version: PonsVersion;
  name: string;
  ticker: string;
  description: string;
  imageUri: string; // data: URI or hosted URL
  quoteAsset: QuoteAsset;
  /** Optional initial dev buy, in ETH (both versions support a first buy). */
  initialBuyEth?: string;
  // ── v2 deploy specifics ──
  /** Quote/pair token address; zero address = native ETH. */
  pairToken?: `0x${string}`;
  /** Which on-chain launch config id to use (v2). Default 0. */
  launchConfigId?: number;
  /** Enable protocol buybacks for this launch (v2). */
  buybackEnabled?: boolean;
  /** Social links, written into the token's on-chain metadata. */
  twitter?: string;
  telegram?: string;
  website?: string;
}

/**
 * An executable launch plan an adapter hands back. Executed via wallet
 * writeContract, so the wallet shows a rich, decoded confirmation.
 */
export interface LaunchPlan {
  address: `0x${string}`;
  // viem Abi; kept loose here to avoid a hard viem type dep in this file.
  abi: unknown;
  functionName: string;
  args: readonly unknown[];
  value: bigint;
  /** Human summary shown alongside the confirm. */
  summary: string;
  /** Warnings to surface before signing (e.g. unaudited, whitelist-only). */
  warnings: string[];
}

/** What the adapter reports about the chosen version before deploy. */
export interface VersionInfo {
  version: PonsVersion;
  label: string;
  liquidity: string;
  quoteAssets: QuoteAsset[];
  graduation: string | null;
  /** false when the registry has no address wired yet → deploy disabled. */
  ready: boolean;
  note: string;
}
