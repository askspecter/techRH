import { PonsV1Adapter } from "./v1";
import { PonsV2Adapter } from "./v2";
import type { LaunchStrategy } from "./strategy";
import type { PonsVersion, VersionInfo } from "./types";

const strategies: Record<PonsVersion, LaunchStrategy> = {
  v1: new PonsV1Adapter(),
  v2: new PonsV2Adapter(),
};

/** Return the adapter for the version the user picked. */
export function getStrategy(version: PonsVersion): LaunchStrategy {
  return strategies[version];
}

/** Info cards for both versions, for the v1/v2 selector UI. */
export function allVersionInfo(): VersionInfo[] {
  return [strategies.v1.info(), strategies.v2.info()];
}

export * from "./types";
export {
  REGISTRY,
  PONS_V1,
  PONS_V2,
  PONS_V1_REFERENCE,
  isVersionWired,
  isVersionDeployable,
  V2_GRADUATION_THRESHOLD_ETH,
} from "./registry";
