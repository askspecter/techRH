/**
 * Build a live, executable launch on the o1 `launchpad-v4-minimal` factory on
 * Arc. Mirrors o1's own planLaunch (o1Bot/TweetLaunch): read the live factory
 * at one block, confirm the USDC quote, mine a `01`-suffix salt from the real
 * token bytecode hash, and hand back the exact call for the user's wallet to
 * sign. DeployButton simulates it before signing, so a bad launch reverts for
 * free rather than mid-flight.
 *
 * Native gas/fee on Arc is USDC (18-decimal native units); the 2 USDC launch
 * fee is sent as msg.value.
 *
 * Optional atomic dev buy (createLaunchAndBuy): because Arc's quote IS the gas
 * asset (USDC), the buy route needs no prefix hop — the launch-buy adapter
 * turns native USDC into ERC-20 USDC itself and the only route step is the
 * launch pool. We simulate the buy to read the exact output, then apply
 * slippage to minAmountOut.
 */
import { createPublicClient, getAddress, http, parseUnits, zeroAddress, type Address } from "viem";
import { arcChain } from "@/lib/chain";
import type { LaunchInput, LaunchPlan } from "@/lib/pons/types";
import { arcLaunchFactoryAbi } from "./abi/launchFactory.arc";
import { ARC } from "./config";
import { readFactoryState, readLaunchBuyAdapter, readQuoteState, readTokenBytecodeHash } from "./factoryState";
import { buildLaunchRoute, launchPoolStep } from "./route";
import { mineCreatorSalt } from "./salt";
import type { O1LaunchBuyParams, O1LaunchParams } from "./types";

const ZERO_SALT = `0x${"0".repeat(64)}` as const;
const DEADLINE_SECONDS = 600n; // 10 minutes to get the tx mined
/** Slippage on the simulated dev-buy output (5%). The opening buy can't be
 *  front-run — nothing trades between create and buy — so this only covers the
 *  block moving between planning and signing. */
const DEV_BUY_SLIPPAGE_BPS = 500n;

function arcPublicClient() {
  return createPublicClient({ chain: arcChain, transport: http() });
}

/** True once the app is pointed at Arc and the o1 factory address is present. */
export function arcLaunchReady(): boolean {
  return arcChain.id === ARC.chainId && !!ARC.contracts.factory;
}

/** Parse a USDC dev-buy amount to native (18-dec) units, floored to the scale
 *  Arc's adapter accepts (multiples of 1e12). Returns 0n for empty/invalid. */
export function parseDevBuyNative(amount?: string): bigint {
  if (!amount) return 0n;
  const trimmed = amount.trim();
  if (!/^\d*\.?\d*$/.test(trimmed) || trimmed === "" || trimmed === ".") return 0n;
  let wei: bigint;
  try {
    wei = parseUnits(trimmed, ARC.usdc.nativeDecimals);
  } catch {
    return 0n;
  }
  return (wei / ARC.nativeUsdcScale) * ARC.nativeUsdcScale;
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

  // 3. Optional atomic dev buy.
  const devBuy = parseDevBuyNative(input.initialBuyEth);
  if (devBuy > 0n) {
    const adapter = await readLaunchBuyAdapter(client, state.hook, block.number).catch(() => zeroAddress as Address);
    if (adapter === zeroAddress) {
      warnings.push("Dev buy is unavailable right now (no launch-buy adapter configured) — launching without it.");
    } else {
      const buyDisplay = (Number(devBuy) / 10 ** ARC.usdc.nativeDecimals).toString();
      const launchHop = launchPoolStep({ quote: quoteToken, token: salt.token, hook: state.hook, tickSpacing: state.tickSpacing });
      const routeData = buildLaunchRoute([], launchHop);
      const value = state.nativeLaunchFee + devBuy;

      // Simulate to read the exact token output, funding the creator virtually
      // so the amount is known even before the wallet is topped up.
      let amountOut = 0n;
      try {
        const probe: O1LaunchBuyParams = { fundingToken: zeroAddress, amountIn: devBuy, minAmountOut: 1n, routeData };
        const { result } = await client.simulateContract({
          address: factory,
          abi: arcLaunchFactoryAbi,
          functionName: "createLaunchAndBuy",
          args: [params, probe],
          account: creator,
          value,
          stateOverride: [{ address: creator, balance: value + parseUnits("1", ARC.usdc.nativeDecimals) }],
        });
        const out = result as readonly [Address, `0x${string}`, bigint];
        if (getAddress(out[0]) !== salt.token) {
          throw new Error(`factory would deploy ${out[0]} but we predicted ${salt.token}`);
        }
        amountOut = out[2];
      } catch (err) {
        throw new Error("Dev-buy simulation failed: " + (err instanceof Error ? err.message.split("\n")[0] : String(err)));
      }

      const minAmountOut = (amountOut * (10_000n - DEV_BUY_SLIPPAGE_BPS)) / 10_000n;
      const buy: O1LaunchBuyParams = { fundingToken: zeroAddress, amountIn: devBuy, minAmountOut: minAmountOut > 0n ? minAmountOut : 1n, routeData };

      return {
        address: factory,
        abi: arcLaunchFactoryAbi,
        functionName: "createLaunchAndBuy",
        args: [params, buy],
        value,
        summary: `Launch "${input.name}" ($${input.ticker}) on o1.exchange (Arc) + buy ${buyDisplay} USDC in one tx. Fee ${feeDisplay} USDC.`,
        warnings,
      };
    }
  }

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
