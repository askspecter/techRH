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

const Q192 = 2n ** 192n;
const FIXED = 10n ** 36n;

/**
 * Convert a pool's sqrtPriceX96 into a token price denominated in WETH.
 *
 * Squares in BigInt: `Number(sqrtPriceX96) / 2**96` rounds to 53 bits *before*
 * squaring, which doubles the relative error and, for the very small prices a
 * fresh 1e9-supply launch trades at, is the difference between a believable
 * price and a wrong one. Also scales by the token/WETH decimal difference so a
 * non-18-decimal token isn't silently mispriced by 10^(18-d).
 */
export function priceFromSqrt(
  sqrtPriceX96: bigint,
  isToken0: boolean,
  tokenDecimals = 18,
  wethDecimals = 18
): number {
  const sqrt = BigInt(sqrtPriceX96 ?? 0n);
  if (sqrt <= 0n) return 0;
  const rawRatioFixed = (sqrt * sqrt * FIXED) / Q192;
  if (rawRatioFixed === 0n) return 0;
  const rawRatio = Number(rawRatioFixed) / 1e36;
  if (!Number.isFinite(rawRatio) || rawRatio === 0) return 0;
  const base = isToken0 ? rawRatio : 1 / rawRatio;
  const scaled = base * 10 ** (tokenDecimals - wethDecimals);
  return Number.isFinite(scaled) && scaled > 0 ? scaled : 0;
}

/**
 * Live price from the pool's slot0. Returns price in WETH; multiply by an
 * ETH/USD oracle for USD (the pons interface uses DeFiLlama). A single reliable
 * read - no historical log scan.
 */
export async function getPriceInWeth(
  pool: Address,
  isToken0: boolean,
  tokenDecimals = 18
): Promise<number> {
  const client = ponsClient();
  const [sqrtPriceX96] = (await client.readContract({
    address: pool,
    abi: poolAbi,
    functionName: "slot0",
  })) as [bigint, number, number, number, number, number, boolean];
  return priceFromSqrt(sqrtPriceX96, isToken0, tokenDecimals);
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

/**
 * Recent v1 TokenLaunched events, newest first, over a bounded window. Unlike
 * indexLaunches (which backfills the whole history from the factory start block,
 * oldest first), this is cheap enough for a live feed: it walks newest to oldest
 * in small chunks, is resilient to per-chunk RPC failures, and stops once it has
 * enough. Scans both the active and legacy v1 factories.
 */
export async function indexV1LaunchesRecent(opts?: {
  lookback?: bigint;
  chunk?: bigint;
  limit?: number;
}): Promise<IndexedLaunch[]> {
  const client = ponsClient();
  const latest = await client.getBlockNumber();
  const lookback = opts?.lookback ?? 400_000n;
  const chunk = opts?.chunk ?? 10_000n;
  const limit = opts?.limit ?? 36;
  const start = latest > lookback ? latest - lookback : 0n;
  const factories = [PONS_V1.activeFactory, PONS_V1.legacyFactory];

  const out: IndexedLaunch[] = [];
  for (let to = latest; to >= start; to -= chunk) {
    const from = to - chunk + 1n > start ? to - chunk + 1n : start;
    for (const factory of factories) {
      // Resilient: a per-chunk RPC failure yields [] instead of throwing.
      const logs = await client
        .getLogs({ address: factory, event: tokenLaunchedEvent, fromBlock: from, toBlock: to })
        .catch(() => []);
      for (const log of logs.reverse()) {
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
    if (out.length >= limit) break;
    if (from === start) break;
  }

  return out
    .sort((x, y) => (y.blockNumber > x.blockNumber ? 1 : y.blockNumber < x.blockNumber ? -1 : 0))
    .slice(0, limit);
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
    try {
      const logs = await client.getLogs({ address: pool, event: swapEvent, fromBlock: from, toBlock: to });
      for (const log of logs) {
        const sp = log.args.sqrtPriceX96;
        if (sp == null) continue;
        const priceWeth = priceFromSqrt(BigInt(sp), isToken0);
        if (priceWeth > 0) points.push({ block: Number(log.blockNumber ?? 0n), priceWeth });
      }
    } catch {
      // One flaky chunk shouldn't discard the whole series - keep what we have
      // and move on. The caller also appends a reliable current-price point.
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
