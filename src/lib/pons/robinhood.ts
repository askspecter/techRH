import { createPublicClient, http, parseEther, toHex, zeroAddress, type Address, type PublicClient } from "viem";
import { rhLaunchChain } from "@/lib/chain";
import { v2FactoryAbi, v2LaunchAndBuyAbi } from "./abisV2";
import { PONS_V2, V2_GRADUATION_THRESHOLD_ETH } from "./registry";
import type { LaunchStrategy } from "./strategy";
import { V2_QUOTE_ASSETS, type LaunchInput, type LaunchPlan, type VersionInfo } from "./types";

/**
 * Robinhood launch path — the ORIGINAL Pons v2 bonding curve, restored as the
 * second deploy target alongside the Arc (o1) launch.
 *
 * The token starts on an ETH-denominated bonding curve holding the full supply,
 * then auto-graduates into a permanently-locked Uniswap V4 pool once the curve
 * fills. Supports RWA quote pairs; creators are paid in ETH.
 *
 * Deploy uses the VERIFIED launchToken() write path (docs.ponsfamily.com/v2):
 * pins economics with previewLaunchEconomics, reads launchFee() live, and
 * derives a fresh CREATE2 salt. All reads/writes are on the Robinhood Chain
 * (chain 4663), distinct from Arc — so this adapter uses its own RPC client
 * instead of the app-wide (Arc) ponsClient().
 *
 * ⚠️ Pons v2 is deployed but UNAUDITED and public launches may be whitelist
 * gated — prepareLaunch checks canLaunch() and surfaces both warnings.
 */

let rhCached: PublicClient | null = null;
/** Robinhood-Chain-bound read client (separate from the primary Arc client). */
function rhClient(): PublicClient {
  if (!rhCached) {
    rhCached = createPublicClient({ chain: rhLaunchChain, transport: http() });
  }
  return rhCached;
}

const factory = PONS_V2.factory;

async function rhLaunchFee(): Promise<bigint> {
  return (await rhClient().readContract({
    address: factory,
    abi: v2FactoryAbi,
    functionName: "launchFee",
  })) as bigint;
}

async function rhPreviewEconomics(launchConfigId: bigint, pairToken: Address): Promise<`0x${string}`> {
  return (await rhClient().readContract({
    address: factory,
    abi: v2FactoryAbi,
    functionName: "previewLaunchEconomics",
    args: [launchConfigId, pairToken],
  })) as `0x${string}`;
}

async function rhCanLaunch(account: Address): Promise<boolean> {
  return (await rhClient().readContract({
    address: factory,
    abi: v2FactoryAbi,
    functionName: "canLaunch",
    args: [account],
  })) as boolean;
}

export class PonsRobinhoodAdapter implements LaunchStrategy {
  info(): VersionInfo {
    return {
      version: "v2",
      label: "Pons · Robinhood launch",
      liquidity: `Fair launch on a bonding curve → graduates to Uniswap V4 (default ~${V2_GRADUATION_THRESHOLD_ETH} ETH)`,
      quoteAssets: V2_QUOTE_ASSETS,
      graduation: "per launch config",
      ready: !!factory,
      note: "ETH-denominated bonding curve on Robinhood Chain. Creators paid in ETH; buyback optional.",
    };
  }

  async prepareLaunch(input: LaunchInput, account: Address): Promise<LaunchPlan> {
    const pairToken = (input.pairToken ?? zeroAddress) as Address;
    const launchConfigId = BigInt(input.launchConfigId ?? 0);

    const warnings: string[] = [];

    // NON-BLOCKING whitelist check. Pons launches may be whitelist-gated
    // ON-CHAIN: if the wallet isn't allowlisted, launchToken() reverts no matter
    // how correct the calldata is. We never block here (deploy is always
    // attempted), but surface a clear reason up front so a revert isn't a mystery.
    const allowed = await rhCanLaunch(account).catch(() => null);
    if (allowed === false) {
      warnings.push(
        "This wallet is not on the Pons launch whitelist, so the launch may revert on-chain " +
          "(only gas is spent). Use a whitelisted wallet, or launch on Arc (o1) instead."
      );
    }

    // Pin the economics we were quoted + read the live launch fee.
    const [expectedEconomics, fee] = await Promise.all([
      rhPreviewEconomics(launchConfigId, pairToken),
      rhLaunchFee(),
    ]);

    // CREATE2 salt — fresh random is correct for an ordinary launch.
    const salt = toHex(crypto.getRandomValues(new Uint8Array(32)));

    const params = {
      name: input.name,
      symbol: input.ticker,
      logo: input.imageUri,
      description: input.description,
      socials: {
        twitter: input.twitter?.trim() ?? "",
        telegram: input.telegram?.trim() ?? "",
        discord: "",
        website: input.website?.trim() ?? "",
        farcaster: "",
      },
      // A successful on-chain launch set this to the caller's address, not the
      // zero address — some factory paths revert on zero.
      creatorFeeRecipient: account,
      creatorTaxBps: 0,
      buybackEnabled: input.buybackEnabled ?? true,
      expectedEconomics,
      salt,
    };

    const quoteLabel = pairToken === zeroAddress ? "ETH (native)" : pairToken;

    // Optional atomic create + first buy via the launch-and-buy router. Nothing
    // can trade between the create and the buy, so the opening buy cannot be
    // front-run; the buy's recipient is exempted from the opening snipe tax.
    const initialBuy = input.initialBuyEth ? parseEther(input.initialBuyEth) : 0n;
    if (initialBuy > 0n) {
      if (pairToken !== zeroAddress) {
        throw new Error(
          "Initial buy is only wired for native ETH launches here. For an ERC-20 pair, approve " +
            "the router for quoteIn first (not implemented in this flow)."
        );
      }
      warnings.push(
        "Atomic create+buy: minTokensOut is 0 (accept-any) since this first buy is front-run-proof by construction."
      );
      return {
        address: PONS_V2.launchAndBuy,
        abi: v2LaunchAndBuyAbi,
        functionName: "launchAndBuy",
        // params, configId, pairToken, quoteIn, minTokensOut, recipient, exemptions
        args: [params, launchConfigId, pairToken, initialBuy, 0n, account, []],
        value: fee + initialBuy, // native: fee + buy travel together
        summary: `Launch "${input.name}" ($${input.ticker}) + buy ${input.initialBuyEth} ETH in one tx (Pons on Robinhood).`,
        warnings,
      };
    }

    return {
      address: factory,
      abi: v2FactoryAbi,
      functionName: "launchToken",
      // 4th arg is address[] snipeTaxExemptions; empty = no exemptions (matches
      // the verified on-chain launch). The 3-arg form reverts.
      args: [params, launchConfigId, pairToken, []],
      value: fee, // launch fee sent as value (native pair)
      summary: `Launch "${input.name}" ($${input.ticker}) via Pons on Robinhood → bonding curve (quote ${quoteLabel}).`,
      warnings,
    };
  }
}
