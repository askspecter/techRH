import { type Address } from "viem";
import { arcLaunchReady, prepareArcLaunch } from "@/lib/o1/launch";
import type { LaunchStrategy } from "./strategy";
import { V2_QUOTE_ASSETS, type LaunchInput, type LaunchPlan, type VersionInfo } from "./types";

/**
 * The live launch path: o1's `launchpad-v4-minimal` factory on Arc mainnet.
 * One `createLaunch` call deploys a fixed-supply ERC-20 + a Uniswap v4 pool
 * with permanently-locked liquidity, quoted in USDC (Arc's stable settlement
 * asset), for a flat 2 USDC creation fee.
 *
 * prepareLaunch reads the live factory config at execution time (config
 * version, fee, creation-enabled, quote, deployer, hook) and mines a token
 * address ending in 0x01 before handing DeployButton the exact call to sign.
 * See src/lib/o1/*.
 */
export class PonsV2Adapter implements LaunchStrategy {
  info(): VersionInfo {
    return {
      version: "v2",
      label: "o1 · Arc launch",
      liquidity: "Uniswap v4 pool with permanently-locked liquidity, quoted in USDC",
      quoteAssets: V2_QUOTE_ASSETS,
      graduation: null,
      ready: arcLaunchReady(),
      note: "Fixed supply, USDC-quoted. Flat 2 USDC creation fee.",
    };
  }

  async prepareLaunch(input: LaunchInput, account: Address): Promise<LaunchPlan> {
    return prepareArcLaunch(input, account);
  }
}
