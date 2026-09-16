/**
 * Route encoding for o1's atomic dev buy (`createLaunchAndBuy`), ported from
 * o1's reference (o1Bot/TweetLaunch, packages/executor/src/route.ts). The
 * layout was reverse-engineered by o1 from live calldata:
 *
 *   abi.encode(Step[])  with
 *   Step = (uint8 kind, address tokenIn, address tokenOut, address pool,
 *           uint24 fee, int24 tickSpacing, address hooks, bytes hookData)
 *   kind 2 = Uniswap V4 pool: pool zero; fee/tickSpacing/hooks form the key.
 *
 * On Arc the quote IS the gas asset (USDC), so the dev buy needs no prefix
 * hop — the launch-buy adapter turns native USDC into ERC-20 USDC itself and
 * the only step is the launch pool (USDC → new token). See o1's
 * discoverPrefixRoutes: a gas-asset quote returns an empty prefix.
 */
import { encodeAbiParameters, zeroAddress, type Address, type Hex } from "viem";

export const ROUTE_KIND = { V3: 1, V4: 2 } as const;
export const MAX_ROUTE_DATA_BYTES = 4096;

export const ROUTE_STEPS_ABI = [
  {
    type: "tuple[]",
    name: "steps",
    components: [
      { name: "kind", type: "uint8" },
      { name: "tokenIn", type: "address" },
      { name: "tokenOut", type: "address" },
      { name: "pool", type: "address" },
      { name: "fee", type: "uint24" },
      { name: "tickSpacing", type: "int24" },
      { name: "hooks", type: "address" },
      { name: "hookData", type: "bytes" },
    ],
  },
] as const;

export type RouteStep = {
  kind: 1 | 2;
  tokenIn: Address;
  tokenOut: Address;
  pool: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
  hookData: Hex;
};

export function v4PoolStep(tokenIn: Address, tokenOut: Address, fee: number, tickSpacing: number, hooks: Address = zeroAddress): RouteStep {
  return { kind: ROUTE_KIND.V4, tokenIn, tokenOut, pool: zeroAddress, fee, tickSpacing, hooks, hookData: "0x" };
}

/** Final hop: paired asset → the token being launched, through o1's pool (LP fee 0, o1 hook). */
export function launchPoolStep(input: { quote: Address; token: Address; hook: Address; tickSpacing: number }): RouteStep {
  return v4PoolStep(input.quote, input.token, 0, input.tickSpacing, input.hook);
}

export function encodeRoute(steps: RouteStep[]): Hex {
  const data = encodeAbiParameters(ROUTE_STEPS_ABI, [steps]);
  const bytes = (data.length - 2) / 2;
  if (bytes > MAX_ROUTE_DATA_BYTES) throw new Error(`route data is ${bytes} bytes; o1 caps it at ${MAX_ROUTE_DATA_BYTES}`);
  return data;
}

/** Prefix hops followed by the launch-pool hop. */
export function buildLaunchRoute(prefix: RouteStep[], launch: RouteStep): Hex {
  return encodeRoute([...prefix, launch]);
}
