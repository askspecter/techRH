/**
 * Build a live, executable launch on the o1 `launchpad-v4-minimal` factory on
 * Arc. Mirrors o1's own planLaunch (o1Bot/TweetLaunch): read the live factory
 * at one block, confirm the USDC quote, mine a `01`-suffix salt from the real
 * token bytecode hash, and hand back the exact `createLaunch` call for the
 * user's wallet to sign. DeployButton simulates it before signing, so a bad
 * launch reverts for free rather than mid-flight.
 *
 * Native gas/fee on Arc is USDC (18-decimal native units); the 2 USDC launch
 * fee is sent as msg.value.
 */
import { createPublicClient, getAddress, http, zeroAddress, type Address } from "viem";
import { arcChain } from "@/lib/chain";
import type { LaunchInput, LaunchPlan } from "@/lib/pons/types";
import { arcLaunchFactoryAbi } from "./abi/launchFactory.arc";
import { ARC } from "./config";
import { readFactoryState, readQuoteState, readTokenBytecodeHash } from "./factoryState";
import { mineCreatorSalt } from "./salt";
import type { O1LaunchParams } from "./types";

const ZERO_SALT = `0x${"0".repeat(64)}` as const;
const DEADLINE_SECONDS = 600n; // 10 minutes to get the tx mined

function arcPublicClient() {
  return createPublicClient({ chain: arcChain, transport: http() });
}

/** True once the app is pointed at Arc and the o1 factory address is present. */
export function arcLaunchReady(): boolean {
  return arcChain.id === ARC.chainId && !!ARC.contracts.factory;
}

export async function prepareArcLaunch(input: LaunchInput, account: Address): Promise<LaunchPlan> {
  const client = arcPublicClient();
  const factory = getAddress(ARC.contracts.factory);
  const quoteToken = getAddress(ARC.usdc.erc20);
  const creator = getAddress(account);
  const warnings: string[] = [];

  // 1. Live factory + quote state at one block.
  const block = await client.getBlock();
  const state = await readFactoryState(client, factory, block.number);
  const quoteState = await readQuoteState(client, factory, quoteToken, block.number);

  if (!state.launchCreationEnabled) throw new Error("o1 launch creation is currently disabled on the Arc factory.");
  if (state.tokenAddressSuffix !== ARC.tokenAddressSuffix) {
    throw new Error(`Unexpected token-address suffix ${state.tokenAddressSuffix} on the Arc factory.`);
  }
  if (!quoteState.registered) throw new Error("USDC is not a registered quote on the Arc factory right now.");
  if (getAddress(state.hook) !== getAddress(ARC.contracts.hook)) {
    throw new Error("Live factory hook differs from the configured o1 Arc hook — refusing to launch.");
  }
  if (getAddress(state.tokenDeployer) !== getAddress(ARC.contracts.launchTokenDeployer)) {
    throw new Error("Live factory token deployer differs from the configured o1 Arc deployer — refusing to launch.");
  }

  // Dev buy is not wired for Arc yet (it needs the launch-buy route discovery);
  // surface it rather than silently dropping funds.
  if (input.initialBuyEth && Number(input.initialBuyEth) > 0) {
    warnings.push("Atomic dev-buy is not supported on Arc yet — launching without an initial buy.");
  }

  const deadline = block.timestamp + DEADLINE_SECONDS;
  const base: Omit<O1LaunchParams, "creatorSalt"> = {
    tokenName: input.name.trim(),
    tokenSymbol: input.ticker.trim(),
    tokenContractURI: input.imageUri ?? "",
    quoteToken,
    expectedConfigVersion: state.configVersion,
    deadline,
    metadataEditable: false,
    metadataKeys: [],
    metadataValues: [],
  };

  // 2. Mine a salt whose predicted token address ends in 0x01, from the real
  // (salt-independent) creation-code hash.
  const bytecodeHash = await readTokenBytecodeHash(client, factory, { ...base, creatorSalt: ZERO_SALT }, block.number);
  const salt = mineCreatorSalt({ creator, deployer: state.tokenDeployer, bytecodeHash, suffix: state.tokenAddressSuffix });

  const params: O1LaunchParams = { ...base, creatorSalt: salt.creatorSalt };

  const feeDisplay = (Number(state.nativeLaunchFee) / 10 ** ARC.usdc.nativeDecimals).toString();

  return {
    address: factory,
    abi: arcLaunchFactoryAbi,
    functionName: "createLaunch",
    args: [params],
    value: state.nativeLaunchFee, // native USDC launch fee (2 USDC)
    summary: `Launch "${input.name}" ($${input.ticker}) on o1.exchange (Arc), USDC-quoted. Fee ${feeDisplay} USDC.`,
    warnings,
  };
}

/** Zero address helper re-export for callers that need it. */
export { zeroAddress };
