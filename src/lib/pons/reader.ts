import { createPublicClient, http, type Address, type PublicClient } from "viem";
import { robinhoodChain } from "../chain";
import { factoryReadAbi, lockerAbi, poolAbi, swapEvent, tokenAbi, tokenLaunchedEvent } from "./abis";
import { PONS_V1 } from "./registry";

/**
 * Read-only Pons v1 integration, wired to the official verified ABIs and
 * addresses. Everything here is authoritative: on-chain events + getters.
 */

let cached: PublicClient | null = null;
export function ponsClient(): PublicClient {
  if (!cached) {
    cached = createPublicClient({ chain: robinhoodChain, transport: http() });
  }
  return cached;
}

export interface TokenState {
  address: Address;
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: bigint;
  logo: string;
  description: string;
  pool: Address;
}

/** The launch token is self-describing on-chain - one multicall-ish read. */
export async function readTokenState(token: Address): Promise<TokenState> {
  const client = ponsClient();
  const [name, symbol, decimals, totalSupply, logo, description, pool] = await Promise.all([
    client.readContract({ address: token, abi: tokenAbi, functionName: "name" }),
    client.readContract({ address: token, abi: tokenAbi, functionName: "symbol" }),
    client.readContract({ address: token, abi: tokenAbi, functionName: "decimals" }),
    client.readContract({ address: token, abi: tokenAbi, functionName: "totalSupply" }),
    client.readContract({ address: token, abi: tokenAbi, functionName: "logo" }),
    client.readContract({ address: token, abi: tokenAbi, functionName: "description" }),
    client.readContract({ address: token, abi: tokenAbi, functionName: "liquidityPool" }),
  ]);
  return { address: token, name, symbol, decimals, totalSupply, logo, description, pool };
}

/** Launch-level parameters from the factory (isToken0 needed for pricing). */
export async function getLaunchedToken(token: Address, factory: Address = PONS_V1.activeFactory) {
  const client = ponsClient();
  const res = (await client.readContract({
    address: factory,
    abi: factoryReadAbi,
    functionName: "getLaunchedToken",
    args: [token],
  })) as LaunchedStruct | { launched: LaunchedStruct };
  // viem may return the named tuple directly or wrapped as { launched }.
  return "launched" in res ? res.launched : res;
}

export interface LaunchedStruct {
  token: Address;
  deployer: Address;
  pairedToken: Address;
  positionManager: Address;
  positionId: bigint;
  dexId: bigint;
  launchConfigId: bigint;
  restrictionsEndBlock: bigint;
  supply: bigint;
  isToken0: boolean;
  poolFee: number;
  exists: boolean;
  initialBuyAmount: bigint;
}

export interface Graduation {
  pairedPrincipal: bigint;
  threshold: bigint;
  graduated: boolean;
  /** 0..1 progress line, as the pons interface renders it. */
  progress: number;
}

export async function getGraduationStatus(
  token: Address,
  factory: Address = PONS_V1.activeFactory
): Promise<Graduation> {
  const client = ponsClient();
  const [pairedPrincipal, threshold, graduated] = (await client.readContract({
    address: factory,
    abi: factoryReadAbi,
    functionName: "graduationStatus",
    args: [token],
  })) as [bigint, bigint, boolean];
  const progress = threshold > 0n ? Number(pairedPrincipal) / Number(threshold) : 0;
  return { pairedPrincipal, threshold, graduated, progress: Math.min(progress, 1) };
}

/**
 * Price from the pool's slot0. Token and WETH are both 18 decimals, so no
 * decimal scaling is required. Returns price in WETH; multiply by an ETH/USD
 * oracle for USD (the pons interface uses DeFiLlama).
 */
export async function getPriceInWeth(pool: Address, isToken0: boolean): Promise<number> {
  const client = ponsClient();
  const [sqrtPriceX96] = (await client.readContract({
    address: pool,
    abi: poolAbi,
    functionName: "slot0",
  })) as [bigint, number, number, number, number, number, boolean];

  const ratio = Number(sqrtPriceX96) / 2 ** 96;
  const token1PerToken0 = ratio * ratio;
  return isToken0 ? token1PerToken0 : 1 / token1PerToken0;
}

/** Creator vs protocol fee split, read from the locker resolved off factory. */
export async function getFeeSplit(token: Address, factory: Address = PONS_V1.activeFactory) {
  const client = ponsClient();
  const locker = (await client.readContract({
    address: factory,
    abi: factoryReadAbi,
    functionName: "locker",
  })) as Address;

  const [protocolShare, redirect] = await Promise.all([
    client.readContract({ address: locker, abi: lockerAbi, functionName: "tokenProtocolFeeShares", args: [token] }),
    client.readContract({ address: locker, abi: lockerAbi, functionName: "feeRedirects", args: [token] }),
  ]);
  return {
    locker,
    creatorSharePercent: 100 - Number(protocolShare),
    protocolSharePercent: Number(protocolShare),
    feeRedirect: redirect as Address,
  };
}

export interface IndexedLaunch {
  token: Address;
  deployer: Address;
  pairToken: Address;
  pool: Address;
  launchConfigId: bigint;
  blockNumber: bigint;
  txHash: `0x${string}`;
}

/**
 * Index TokenLaunched events in bounded block chunks. The public RPC times
 * out on wide eth_getLogs ranges, so we backfill from the factory start block
 * in chunks (docs' explicit guidance).
 */
export async function indexLaunches(opts?: {
  factory?: Address;
  fromBlock?: bigint;
  toBlock?: bigint;
  chunk?: bigint;
  useLegacy?: boolean;
}): Promise<IndexedLaunch[]> {
  const client = ponsClient();
  const factory = opts?.factory ?? (opts?.useLegacy ? PONS_V1.legacyFactory : PONS_V1.activeFactory);
  const start =
    opts?.fromBlock ??
    (opts?.useLegacy ? PONS_V1.legacyFactoryStartBlock : PONS_V1.activeFactoryStartBlock);
  const end = opts?.toBlock ?? (await client.getBlockNumber());
  const chunk = opts?.chunk ?? 50_000n;

  const out: IndexedLaunch[] = [];
  for (let from = start; from <= end; from += chunk) {
    const to = from + chunk - 1n > end ? end : from + chunk - 1n;
    const logs = await client.getLogs({
      address: factory,
      event: tokenLaunchedEvent,
      fromBlock: from,
      toBlock: to,
    });
    for (const log of logs) {
      const a = log.args;
      out.push({
        token: a.token as Address,
        deployer: a.deployer as Address,
        pairToken: a.pairToken as Address,
        pool: a.pool as Address,
        launchConfigId: (a.launchConfigId ?? 0n) as bigint,
        blockNumber: log.blockNumber ?? 0n,
        txHash: log.transactionHash ?? "0x",
      });
    }
  }
  return out;
}

export interface SwapPoint {
  block: number;
  priceWeth: number;
}

/**
 * Index recent Swap events on a Uniswap V3 pool → a chronological price series
 * (price of the launch token in WETH). Bounded, chunked scan for the RPC.
 */
export async function indexPoolSwaps(
  pool: Address,
  isToken0: boolean,
  opts?: { lookback?: bigint; chunk?: bigint }
): Promise<SwapPoint[]> {
  const client = ponsClient();
  const latest = await client.getBlockNumber();
  const lookback = opts?.lookback ?? 250_000n;
  const chunk = opts?.chunk ?? 10_000n;
  const start = latest > lookback ? latest - lookback : 0n;

  const points: SwapPoint[] = [];
  for (let from = start; from <= latest; from += chunk) {
    const to = from + chunk - 1n > latest ? latest : from + chunk - 1n;
    const logs = await client.getLogs({ address: pool, event: swapEvent, fromBlock: from, toBlock: to });
    for (const log of logs) {
      const sp = log.args.sqrtPriceX96;
      if (sp == null) continue;
      const ratio = Number(sp) / 2 ** 96;
      const token1PerToken0 = ratio * ratio;
      const priceWeth = isToken0 ? token1PerToken0 : token1PerToken0 === 0 ? 0 : 1 / token1PerToken0;
      points.push({ block: Number(log.blockNumber ?? 0n), priceWeth });
    }
    if (from === latest) break;
  }
  return points;
}

/**
 * Derive trade direction from a Swap's signed amounts and token ordering.
 *   tokenIsToken0 = token < pairToken (address comparison)
 */
export function deriveSwapSide(
  token: Address,
  pairToken: Address,
  amount0: bigint,
  amount1: bigint
): "buy" | "sell" {
  const tokenIsToken0 = token.toLowerCase() < pairToken.toLowerCase();
  const pairSigned = tokenIsToken0 ? amount1 : amount0;
  return pairSigned > 0n ? "buy" : "sell";
}
