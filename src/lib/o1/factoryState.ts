/**
 * Live reads of the o1 `launchpad-v4-minimal` factory on Arc. Ported from
 * o1's reference (o1Bot/TweetLaunch, packages/executor/src/factory-state.ts),
 * but using per-call readContract instead of Multicall3 so it does not depend
 * on a multicall deployment being wired into the chain definition.
 *
 * Everything is read at ONE block so the values are mutually consistent. Never
 * build a transaction from the static snapshot in config.ts — read this first.
 */
import { getAddress, parseAbi, type Address, type Hex, type PublicClient } from "viem";
import { arcLaunchFactoryAbi } from "./abi/launchFactory.arc";
import type { FactoryState, O1LaunchParams, QuoteState } from "./types";

const hookAbi = parseAbi(["function launchBuyAdapter() view returns (address)"]);

export async function readFactoryState(client: PublicClient, factory: Address, blockNumber: bigint): Promise<FactoryState> {
  const c = { address: factory, abi: arcLaunchFactoryAbi } as const;
  const [configVersion, launchSupply, tickSpacing, nativeLaunchFee, launchCreationEnabled, tokenAddressSuffix, hook, tokenDeployer] =
    await Promise.all([
      client.readContract({ ...c, functionName: "configVersion", blockNumber }),
      client.readContract({ ...c, functionName: "launchSupply", blockNumber }),
      client.readContract({ ...c, functionName: "tickSpacing", blockNumber }),
      client.readContract({ ...c, functionName: "nativeLaunchFee", blockNumber }),
      client.readContract({ ...c, functionName: "launchCreationEnabled", blockNumber }),
      client.readContract({ ...c, functionName: "TOKEN_ADDRESS_SUFFIX", blockNumber }),
      client.readContract({ ...c, functionName: "hook", blockNumber }),
      client.readContract({ ...c, functionName: "tokenDeployer", blockNumber }),
    ]);
  return {
    configVersion: configVersion as bigint,
    launchSupply: launchSupply as bigint,
    tickSpacing: Number(tickSpacing),
    nativeLaunchFee: nativeLaunchFee as bigint,
    launchCreationEnabled: launchCreationEnabled as boolean,
    tokenAddressSuffix: Number(tokenAddressSuffix),
    tokenDeployer: getAddress(tokenDeployer as Address),
    hook: getAddress(hook as Address),
  };
}

/** The launch-buy adapter the hook currently points at (address(0) if none). */
export async function readLaunchBuyAdapter(client: PublicClient, hook: Address, blockNumber: bigint): Promise<Address> {
  const a = await client.readContract({ address: hook, abi: hookAbi, functionName: "launchBuyAdapter", blockNumber });
  return getAddress(a as Address);
}

export async function readQuoteState(client: PublicClient, factory: Address, quote: Address, blockNumber: bigint): Promise<QuoteState> {
  const c = { address: factory, abi: arcLaunchFactoryAbi } as const;
  const [config, revision] = await Promise.all([
    client.readContract({ ...c, functionName: "quoteConfig", args: [quote], blockNumber }),
    client.readContract({ ...c, functionName: "quoteRevision", args: [quote], blockNumber }),
  ]);
  const [registered, quoteDecimals, startTickToken0Frame] = config as readonly [boolean, number, number];
  return {
    registered,
    quoteDecimals: Number(quoteDecimals),
    startTickToken0Frame: Number(startTickToken0Frame),
    revision: revision as bigint,
  };
}

/** Bytecode hash of the token the factory would deploy for these params (salt-independent). */
export async function readTokenBytecodeHash(client: PublicClient, factory: Address, params: O1LaunchParams, blockNumber: bigint): Promise<Hex> {
  const hash = await client.readContract({
    address: factory,
    abi: arcLaunchFactoryAbi,
    functionName: "launchTokenBytecodeHash",
    args: [params],
    blockNumber,
  });
  return hash as Hex;
}
