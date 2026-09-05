import { zeroAddress, type Address } from "viem";
import { ponsClient } from "./reader";
import { PONS_V2 } from "./registry";
import {
  v2CurveAbi,
  v2CurveBuyEvent,
  v2CurveSellEvent,
  v2FactoryAbi,
  v2TokenAbi,
  v2TokenLaunchedEvent,
  V2_PHASE,
  type V2Phase,
} from "./abisV2";

const factory = PONS_V2.factory;

// ── Launch configs ──────────────────────────────────────────────────────────

export interface LaunchConfig {
  id: bigint;
  supply: bigint;
  curveFeeBps: bigint;
  phantomQuote: bigint;
  graduationThreshold: bigint;
  poolFee: number;
  tickSpacing: number;
  enabled: boolean;
}

/**
 * Configs open for new launches. Disabled configs stay readable (so historic
 * launches remain explainable) but a create flow must not offer them - a
 * disabled id reverts with LaunchConfigDisabled. Read at create time, don't
 * cache ids indefinitely.
 */
export async function openLaunchConfigs(): Promise<LaunchConfig[]> {
  const client = ponsClient();
  const count = (await client.readContract({
    address: factory,
    abi: v2FactoryAbi,
    functionName: "launchConfigCount",
  })) as bigint;

  const raw = await Promise.all(
    Array.from({ length: Number(count) }, (_, id) =>
      client.readContract({
        address: factory,
        abi: v2FactoryAbi,
        functionName: "getLaunchConfig",
        args: [BigInt(id)],
      })
    )
  );

  return raw
    .map((c, id) => ({ id: BigInt(id), ...(c as Omit<LaunchConfig, "id">) }))
    .filter((c) => c.enabled);
}

// ── Quote assets ────────────────────────────────────────────────────────────

export interface UsableQuoteAsset {
  asset: Address;
  symbol: string;
  name: string;
  graduationThreshold: bigint;
  decimals: number;
}

/**
 * Filter candidate quote assets to those a create flow may safely offer.
 * An asset that fails either read (or the factory hasn't approved) would revert
 * at launch, so it is dropped. Native ETH (zero address) is always available
 * and is prepended. Candidates carry a display symbol + name. Validated in
 * parallel.
 */
export async function usableQuoteAssets(
  candidates: { symbol: string; name: string; address: Address }[]
): Promise<UsableQuoteAsset[]> {
  const client = ponsClient();

  const checked = await Promise.all(
    candidates.map(async ({ symbol, name, address: asset }): Promise<UsableQuoteAsset | null> => {
      if (asset === zeroAddress) return null;
      try {
        const [approved, economics] = await Promise.all([
          client.readContract({ address: factory, abi: v2FactoryAbi, functionName: "approvedPairTokens", args: [asset] }),
          client.readContract({ address: factory, abi: v2FactoryAbi, functionName: "pairTokenEconomics", args: [asset] }),
        ]);
        const [phantomQuote, graduationThreshold, decimals] = economics as [bigint, bigint, number];
        if (!approved || phantomQuote === 0n || graduationThreshold === 0n) return null;
        return { asset, symbol, name, graduationThreshold, decimals: Number(decimals) || 18 };
      } catch {
        return null;
      }
    })
  );

  return [
    // Native ETH: threshold denominated in wei (18 decimals).
    { asset: zeroAddress, symbol: "ETH", name: "Ether", graduationThreshold: 0n, decimals: 18 },
    ...checked.filter((x): x is UsableQuoteAsset => x !== null),
  ];
}

// ── Launch gate + fee + economics pin ───────────────────────────────────────

export async function canLaunch(account: Address): Promise<boolean> {
  const client = ponsClient();
  return (await client.readContract({
    address: factory,
    abi: v2FactoryAbi,
    functionName: "canLaunch",
    args: [account],
  })) as boolean;
}

export async function launchFee(): Promise<bigint> {
  const client = ponsClient();
  return (await client.readContract({
    address: factory,
    abi: v2FactoryAbi,
    functionName: "launchFee",
  })) as bigint;
}

/** Pin economics so a launch cannot settle on terms you did not read. */
export async function previewLaunchEconomics(launchConfigId: bigint, pairToken: Address): Promise<`0x${string}`> {
  const client = ponsClient();
  return (await client.readContract({
    address: factory,
    abi: v2FactoryAbi,
    functionName: "previewLaunchEconomics",
    args: [launchConfigId, pairToken],
  })) as `0x${string}`;
}

// ── Launch record + curve state ─────────────────────────────────────────────

export interface LaunchedTokenV2 {
  token: Address;
  curve: Address;
  deployer: Address;
  creatorFeeRecipient: Address;
  pairToken: Address;
  graduationThreshold: bigint;
  poolFee: number;
  tickSpacing: number;
  creatorTaxBps: number;
  buybackEnabled: boolean;
  phase: number;
  sweptQuote: bigint;
  sweptTokens: bigint;
  sweptAt: bigint;
  exists: boolean;
}

export async function getLaunchedTokenV2(token: Address): Promise<LaunchedTokenV2> {
  const client = ponsClient();
  return (await client.readContract({
    address: factory,
    abi: v2FactoryAbi,
    functionName: "getLaunchedToken",
    args: [token],
  })) as LaunchedTokenV2;
}

export function phaseLabel(phase: number): string {
  return V2_PHASE[phase as V2Phase] ?? `Unknown(${phase})`;
}

export interface CurveState {
  quoteReserve: bigint;
  tokenReserve: bigint;
  realQuoteReserve: bigint;
  graduationThreshold: bigint;
  sellableTokens: bigint;
  readyToGraduate: boolean;
  graduated: boolean;
  /** Marginal spot price of 1 token in the quote asset (display only). */
  spotPrice: number;
  /** 0..1 raised-vs-threshold progress. */
  progress: number;
  feeBps: bigint;
  creatorTaxBps: bigint;
}

/** Live curve state for a v2 launch (pre-graduation trading + progress). */
export async function getCurveState(curve: Address): Promise<CurveState> {
  const client = ponsClient();
  const read = (functionName: string, args?: unknown[]) =>
    client.readContract({ address: curve, abi: v2CurveAbi, functionName: functionName as never, args: args as never });

  const [reserves, realQuote, threshold, sellable, ready, grad, feeBps, creatorTaxBps] = await Promise.all([
    read("getReserves"),
    read("realQuoteReserve"),
    read("graduationThreshold"),
    read("sellableTokens"),
    read("readyToGraduate"),
    read("graduated"),
    read("feeBps"),
    read("creatorTaxBps"),
  ]);
  const [quoteReserve, tokenReserve] = reserves as [bigint, bigint];

  return {
    quoteReserve,
    tokenReserve,
    realQuoteReserve: realQuote as bigint,
    graduationThreshold: threshold as bigint,
    sellableTokens: sellable as bigint,
    readyToGraduate: ready as boolean,
    graduated: grad as boolean,
    spotPrice: tokenReserve > 0n ? Number(quoteReserve) / Number(tokenReserve) : 0,
    progress: (threshold as bigint) > 0n ? Number(realQuote) / Number(threshold as bigint) : 0,
    feeBps: feeBps as bigint,
    creatorTaxBps: creatorTaxBps as bigint,
  };
}

export interface TokenInfoV2 {
  name: string;
  symbol: string;
  decimals: number;
  deployer: Address;
  logo: string;
  description: string;
}

// ── Feed: recent launches ────────────────────────────────────────────────────

export interface FeedLaunch {
  token: Address;
  curve: Address;
  deployer: Address;
  pairToken: Address;
  graduationThreshold: bigint;
  blockNumber: bigint;
  txHash: `0x${string}`;
}

/**
 * Index recent v2 TokenLaunched events, newest first. The public RPC times out
 * on wide ranges, so we scan back a bounded window in block chunks.
 */
export async function indexV2Launches(opts?: {
  lookback?: bigint;
  chunk?: bigint;
  limit?: number;
}): Promise<FeedLaunch[]> {
  const client = ponsClient();
  const latest = await client.getBlockNumber();
  const lookback = opts?.lookback ?? 300_000n;
  const chunk = opts?.chunk ?? 10_000n;
  const limit = opts?.limit ?? 36;
  const start = latest > lookback ? latest - lookback : 0n;

  const out: FeedLaunch[] = [];
  // Walk newest → oldest so we can stop early once we have enough.
  for (let to = latest; to >= start; to -= chunk) {
    const from = to - chunk + 1n > start ? to - chunk + 1n : start;
    const logs = await client.getLogs({
      address: PONS_V2.factory,
      event: v2TokenLaunchedEvent,
      fromBlock: from,
      toBlock: to,
    });
    for (const log of logs.reverse()) {
      const a = log.args;
      out.push({
        token: a.token as Address,
        curve: a.curve as Address,
        deployer: a.deployer as Address,
        pairToken: a.pairToken as Address,
        graduationThreshold: (a.graduationThreshold ?? 0n) as bigint,
        blockNumber: log.blockNumber ?? 0n,
        txHash: log.transactionHash ?? "0x",
      });
    }
    if (out.length >= limit) break;
    if (from === start) break;
  }

  return out
    .sort((x, y) => (y.blockNumber > x.blockNumber ? 1 : y.blockNumber < x.blockNumber ? -1 : 0))
    .slice(0, limit);
}

// ── Chart: bonding-curve trade history ───────────────────────────────────────

export interface CurveTradePoint {
  block: number;
  /** Executed price of 1 token in the quote asset. */
  price: number;
}

/**
 * Index a curve's CurveBuy / CurveSell events into a chronological price series
 * (price of the launch token in the quote asset). Bounded, chunked scan for the
 * public RPC. Post-graduation this is the curve's historical price, since later
 * trades move to the graduated pool.
 */
export async function indexCurveTrades(
  curve: Address,
  tokenDecimals: number,
  quoteDecimals: number,
  opts?: { lookback?: bigint; chunk?: bigint }
): Promise<CurveTradePoint[]> {
  const client = ponsClient();
  const latest = await client.getBlockNumber();
  const lookback = opts?.lookback ?? 250_000n;
  const chunk = opts?.chunk ?? 10_000n;
  const start = latest > lookback ? latest - lookback : 0n;
  const tokDiv = 10 ** tokenDecimals;
  const quoteDiv = 10 ** quoteDecimals;

  const raw: { block: number; logIndex: number; price: number }[] = [];
  for (let from = start; from <= latest; from += chunk) {
    const to = from + chunk - 1n > latest ? latest : from + chunk - 1n;
    const [buys, sells] = await Promise.all([
      client.getLogs({ address: curve, event: v2CurveBuyEvent, fromBlock: from, toBlock: to }),
      client.getLogs({ address: curve, event: v2CurveSellEvent, fromBlock: from, toBlock: to }),
    ]);
    for (const log of buys) {
      const q = log.args.quoteIn;
      const t = log.args.tokensOut;
      if (q == null || t == null || t === 0n) continue;
      const price = Number(q) / quoteDiv / (Number(t) / tokDiv);
      if (isFinite(price) && price > 0) raw.push({ block: Number(log.blockNumber ?? 0n), logIndex: Number(log.logIndex ?? 0), price });
    }
    for (const log of sells) {
      const q = log.args.quoteOut;
      const t = log.args.tokensIn;
      if (q == null || t == null || t === 0n) continue;
      const price = Number(q) / quoteDiv / (Number(t) / tokDiv);
      if (isFinite(price) && price > 0) raw.push({ block: Number(log.blockNumber ?? 0n), logIndex: Number(log.logIndex ?? 0), price });
    }
    if (from === latest) break;
  }

  raw.sort((a, b) => a.block - b.block || a.logIndex - b.logIndex);
  return raw.map(({ block, price }) => ({ block, price }));
}

// ── Activity: full trade rows (for the trades list + volume) ─────────────────

export interface CurveTradeRow {
  block: number;
  logIndex: number;
  type: "buy" | "sell";
  account: Address;
  /** Quote-asset amount, in whole units. */
  quote: number;
  /** Launch-token amount, in whole units. */
  tokens: number;
  txHash: `0x${string}`;
}

/**
 * Index a curve's CurveBuy / CurveSell events into full trade rows (who, side,
 * quote amount, token amount), newest last. Same bounded, chunked scan as the
 * chart. The caller sums `quote` for volume and takes the tail for a recent
 * trades list.
 */
export async function indexCurveTradeRows(
  curve: Address,
  tokenDecimals: number,
  quoteDecimals: number,
  opts?: { lookback?: bigint; chunk?: bigint }
): Promise<CurveTradeRow[]> {
  const client = ponsClient();
  const latest = await client.getBlockNumber();
  const lookback = opts?.lookback ?? 250_000n;
  const chunk = opts?.chunk ?? 10_000n;
  const start = latest > lookback ? latest - lookback : 0n;
  const tokDiv = 10 ** tokenDecimals;
  const quoteDiv = 10 ** quoteDecimals;

  const rows: CurveTradeRow[] = [];
  for (let from = start; from <= latest; from += chunk) {
    const to = from + chunk - 1n > latest ? latest : from + chunk - 1n;
    const [buys, sells] = await Promise.all([
      client.getLogs({ address: curve, event: v2CurveBuyEvent, fromBlock: from, toBlock: to }),
      client.getLogs({ address: curve, event: v2CurveSellEvent, fromBlock: from, toBlock: to }),
    ]);
    for (const log of buys) {
      const q = log.args.quoteIn;
      const t = log.args.tokensOut;
      if (q == null || t == null) continue;
      rows.push({
        block: Number(log.blockNumber ?? 0n),
        logIndex: Number(log.logIndex ?? 0),
        type: "buy",
        account: (log.args.buyer ?? zeroAddress) as Address,
        quote: Number(q) / quoteDiv,
        tokens: Number(t) / tokDiv,
        txHash: (log.transactionHash ?? "0x") as `0x${string}`,
      });
    }
    for (const log of sells) {
      const q = log.args.quoteOut;
      const t = log.args.tokensIn;
      if (q == null || t == null) continue;
      rows.push({
        block: Number(log.blockNumber ?? 0n),
        logIndex: Number(log.logIndex ?? 0),
        type: "sell",
        account: (log.args.seller ?? zeroAddress) as Address,
        quote: Number(q) / quoteDiv,
        tokens: Number(t) / tokDiv,
        txHash: (log.transactionHash ?? "0x") as `0x${string}`,
      });
    }
    if (from === latest) break;
  }

  rows.sort((a, b) => a.block - b.block || a.logIndex - b.logIndex);
  return rows;
}

/** Block timestamps (unix seconds) for a small set of block numbers. */
export async function blockTimestamps(blocks: number[]): Promise<Record<number, number>> {
  const client = ponsClient();
  const unique = Array.from(new Set(blocks));
  const out: Record<number, number> = {};
  await Promise.all(
    unique.map(async (b) => {
      try {
        const blk = await client.getBlock({ blockNumber: BigInt(b) });
        out[b] = Number(blk.timestamp);
      } catch {
        /* leave unset */
      }
    })
  );
  return out;
}

// ── Supply + burned ──────────────────────────────────────────────────────────

const erc20BalanceAbi = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "totalSupply", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
] as const;

const DEAD = "0x000000000000000000000000000000000000dEaD" as Address;

export interface SupplyStats {
  totalSupply: number;
  burned: number;
  circulating: number;
}

/**
 * Total supply plus tokens sent to burn sinks (dead + zero address). Circulating
 * is totalSupply minus burned. All in whole token units.
 */
export async function tokenSupplyStats(token: Address, decimals: number): Promise<SupplyStats> {
  const client = ponsClient();
  const div = 10 ** decimals;
  const [total, dead, zero] = await Promise.all([
    client.readContract({ address: token, abi: erc20BalanceAbi, functionName: "totalSupply" }) as Promise<bigint>,
    client.readContract({ address: token, abi: erc20BalanceAbi, functionName: "balanceOf", args: [DEAD] }).catch(() => 0n) as Promise<bigint>,
    client.readContract({ address: token, abi: erc20BalanceAbi, functionName: "balanceOf", args: [zeroAddress] }).catch(() => 0n) as Promise<bigint>,
  ]);
  const totalSupply = Number(total) / div;
  const burned = (Number(dead) + Number(zero)) / div;
  return { totalSupply, burned, circulating: Math.max(totalSupply - burned, 0) };
}

/** Quote-asset shape a chart needs: native ETH vs an ERC-20, and its decimals. */
export async function getQuoteMeta(curve: Address): Promise<{ isNative: boolean; decimals: number; pairToken: Address }> {
  const client = ponsClient();
  const [isNative, pairToken] = await Promise.all([
    client.readContract({ address: curve, abi: v2CurveAbi, functionName: "isNativeQuote" }) as Promise<boolean>,
    client.readContract({ address: curve, abi: v2CurveAbi, functionName: "pairToken" }) as Promise<Address>,
  ]);
  if (isNative || pairToken === zeroAddress) return { isNative: true, decimals: 18, pairToken: zeroAddress };
  try {
    const [, , decimals] = (await client.readContract({
      address: factory,
      abi: v2FactoryAbi,
      functionName: "pairTokenEconomics",
      args: [pairToken],
    })) as [bigint, bigint, number];
    return { isNative: false, decimals: Number(decimals) || 18, pairToken };
  } catch {
    return { isNative: false, decimals: 18, pairToken };
  }
}

export async function readTokenInfoV2(token: Address): Promise<TokenInfoV2> {
  const client = ponsClient();
  const [name, symbol, decimals, info] = await Promise.all([
    client.readContract({ address: token, abi: v2TokenAbi, functionName: "name" }),
    client.readContract({ address: token, abi: v2TokenAbi, functionName: "symbol" }),
    client.readContract({ address: token, abi: v2TokenAbi, functionName: "decimals" }),
    client.readContract({ address: token, abi: v2TokenAbi, functionName: "getTokenInfo" }),
  ]);
  const [deployer, logo, description] = info as [Address, string, string, unknown];
  return { name: name as string, symbol: symbol as string, decimals: decimals as number, deployer, logo, description };
}
