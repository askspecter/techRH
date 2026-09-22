import type { Chain } from "viem";
import { arcChain, rhLaunchChain, explorerTxForChain } from "@/lib/chain";
import { PonsV2Adapter } from "@/lib/pons/v2";
import { PonsRobinhoodAdapter } from "@/lib/pons/robinhood";
import type { LaunchStrategy } from "@/lib/pons/strategy";
import type { PonsVersion } from "@/lib/pons/types";

/** The two launch targets the studio offers. */
export type LaunchTargetId = "arc" | "robinhood";

export interface LaunchTarget {
  id: LaunchTargetId;
  /** Short button label. */
  label: string;
  /** One-line description under the label. */
  tagline: string;
  /** The chain this target deploys to. */
  chain: Chain;
  /** Native/quote asset the fee + dev-buy are denominated in. */
  nativeSymbol: string;
  /** Strategy that builds the launch calldata for this target. */
  strategy: LaunchStrategy;
  /** Version tag recorded to the feed. */
  version: PonsVersion;
  /** Explorer tx URL builder for this target's chain. */
  explorerTx: (hash: string) => string;
}

const arcTarget: LaunchTarget = {
  id: "arc",
  label: "Arc",
  tagline: "o1 launchpad · USDC-quoted, gas in USDC",
  chain: arcChain,
  nativeSymbol: "USDC",
  strategy: new PonsV2Adapter(),
  version: "v2",
  explorerTx: (hash) => explorerTxForChain(arcChain.id, hash),
};

const robinhoodTarget: LaunchTarget = {
  id: "robinhood",
  label: "Robinhood",
  tagline: "Pons bonding curve · ETH-quoted on Robinhood Chain",
  chain: rhLaunchChain,
  nativeSymbol: "ETH",
  strategy: new PonsRobinhoodAdapter(),
  version: "v2",
  explorerTx: (hash) => explorerTxForChain(rhLaunchChain.id, hash),
};

export const LAUNCH_TARGETS: Record<LaunchTargetId, LaunchTarget> = {
  arc: arcTarget,
  robinhood: robinhoodTarget,
};

/** Ordered list for rendering the two-option selector (Arc first / default). */
export const LAUNCH_TARGET_LIST: LaunchTarget[] = [arcTarget, robinhoodTarget];

export const DEFAULT_LAUNCH_TARGET: LaunchTargetId = "arc";
