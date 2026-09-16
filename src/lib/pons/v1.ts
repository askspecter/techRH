import { type Address } from "viem";
import { prepareArcLaunch } from "@/lib/o1/launch";
import type { LaunchStrategy } from "./strategy";
import { V1_QUOTE_ASSETS, type LaunchInput, type LaunchPlan, type VersionInfo } from "./types";

/**
 * Arc has a single launch path (o1's `launchpad-v4-minimal`), so v1 is retired
 * as a distinct model: it is marked not-ready in the picker and, if selected
 * anyway, simply routes to the same o1 Arc launch as v2.
 */
export class PonsV1Adapter implements LaunchStrategy {
  info(): VersionInfo {
    return {
      version: "v1",
      label: "v1 · retired on Arc",
      liquidity: "Use the o1 Arc launch",
      quoteAssets: V1_QUOTE_ASSETS,
      graduation: null,
      ready: false,
      note: "Arc launches all go through o1's launchpad — pick the o1 · Arc launch.",
    };
  }

  async prepareLaunch(input: LaunchInput, account: Address): Promise<LaunchPlan> {
    return prepareArcLaunch(input, account);
  }
}
