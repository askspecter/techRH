import { parseAbiItem } from "viem";

/**
 * The event the o1 `launchpad-v4-minimal` factory emits on a successful
 * launch. Used to pull the new token address out of the deploy receipt so the
 * launch can be recorded to the feed.
 *
 * event Launched(address indexed token, bytes32 indexed poolId,
 *                address indexed originalCreator, address quoteToken,
 *                uint256 launchSupply, int24 tickSpacing)
 */
export const o1LaunchedEvent = parseAbiItem(
  "event Launched(address indexed token, bytes32 indexed poolId, address indexed originalCreator, address quoteToken, uint256 launchSupply, int24 tickSpacing)",
);
