import type { Address } from "viem";
import type { LaunchInput, LaunchPlan, VersionInfo } from "./types";

/**
 * A LaunchStrategy hides the differences between Pons versions behind one
 * interface. The UI, wallet layer and indexer never branch on the version -
 * they just ask the active strategy to prepare the launch.
 *
 * Adding a future version means writing one more adapter, nothing else.
 */
export interface LaunchStrategy {
  info(): VersionInfo;

  /**
   * Prepare an executable launch plan for the connected account. May read
   * on-chain (e.g. v2 pins economics and reads the launch fee live). Throws
   * with a clear message if the version's write path isn't enabled yet.
   */
  prepareLaunch(input: LaunchInput, account: Address): Promise<LaunchPlan>;
}
