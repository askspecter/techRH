import { parseEther, toHex, zeroAddress, type Address } from "viem";
import { v2FactoryAbi, v2LaunchAndBuyAbi } from "./abisV2";
import { PONS_V2, REGISTRY, V2_GRADUATION_THRESHOLD_ETH } from "./registry";
import { canLaunch, launchFee, previewLaunchEconomics } from "./readerV2";
import type { LaunchStrategy } from "./strategy";
import { V2_QUOTE_ASSETS, type LaunchInput, type LaunchPlan, type VersionInfo } from "./types";

/**
 * Pons v2 - the token starts on an ETH-denominated bonding curve holding the
 * full supply, then auto-graduates into a permanently-locked Uniswap V4 pool
 * once the curve fills. Supports RWA quote pairs; creators are paid in ETH.
 *
 * Deploy uses the VERIFIED launchToken() write path (docs.ponsfamily.com/v2):
 * pins economics with previewLaunchEconomics, reads launchFee() live, and
 * derives CREATE2 addresses from a fresh salt.
 *
 * ⚠️ v2 is deployed but UNAUDITED and public launches are closed (whitelist
 * only) - prepareLaunch checks canLaunch() and surfaces both warnings.
 */
export class PonsV2Adapter implements LaunchStrategy {
  info(): VersionInfo {
    const cfg = REGISTRY.v2;
    return {
      version: "v2",
      label: "v2 · Bonding Curve",
      liquidity: `Fair launch on a bonding curve → graduates to Uniswap V4 (default ~${V2_GRADUATION_THRESHOLD_ETH} ETH)`,
      quoteAssets: V2_QUOTE_ASSETS,
      graduation: "per launch config",
      ready: cfg.factory !== "" && cfg.launchAbiVerified,
      note: "Creators paid in ETH; buyback optional.",
    };
  }

  async prepareLaunch(input: LaunchInput, account: Address): Promise<LaunchPlan> {
    const factory = PONS_V2.factory;
    const pairToken = (input.pairToken ?? zeroAddress) as Address;
    const launchConfigId = BigInt(input.launchConfigId ?? 0);

    const warnings: string[] = [];

    // NON-BLOCKING whitelist check. Pons v2 launches are whitelist-gated
    // ON-CHAIN: if the wallet isn't allowlisted, launchToken() reverts no matter
    // how correct the calldata is — the frontend cannot bypass that. We never
    // block here (deploy is always attempted, per request), but we surface a
    // clear reason up front so a revert isn't a mystery.
    const allowed = await canLaunch(account).catch(() => null);
    if (allowed === false) {
      warnings.push(
        "This wallet is not on the Pons v2 whitelist, so the launch will revert on-chain " +
          "(only gas is spent). Ask Pons to whitelist this address, use the wallet that has " +
          "launched before, or launch with v1 (open, no whitelist)."
      );
    }

    // Pin the economics we were quoted + read the live launch fee.
    const [expectedEconomics, fee] = await Promise.all([
      previewLaunchEconomics(launchConfigId, pairToken),
      launchFee(),
    ]);

    // CREATE2 salt - fresh random is correct for an ordinary launch.
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
      // A successful on-chain launch (selector 0xa72101af) set this to the
      // caller's address, not the zero address — some factory paths revert on
      // zero. Match the proven-working calldata.
      creatorFeeRecipient: account,
      creatorTaxBps: 0,
      buybackEnabled: input.buybackEnabled ?? true,
      expectedEconomics,
      salt,
    };

    const quoteLabel = pairToken === zeroAddress ? "ETH (native)" : pairToken;

    // Optional atomic create + first buy via the launch-and-buy router.
    // Nothing can trade between the create and the buy, so the opening buy
    // cannot be front-run; the buy's recipient is exempted from the opening
    // snipe tax automatically.
    const initialBuy = input.initialBuyEth ? parseEther(input.initialBuyEth) : 0n;
    if (initialBuy > 0n) {
      if (pairToken !== zeroAddress) {
        throw new Error(
          "Initial buy is only wired for native ETH launches here. For an ERC-20 pair, approve " +
            "the router for quoteIn first (not implemented in this flow)."
        );
      }
      // creatorFeeRecipient MUST be explicit for launchAndBuy (zero is rejected).
      const routerParams = { ...params, creatorFeeRecipient: account };
      warnings.push(
        "Atomic create+buy: minTokensOut is 0 (accept-any) since this first buy is front-run-proof by construction."
      );
      return {
        address: PONS_V2.launchAndBuy,
        abi: v2LaunchAndBuyAbi,
        functionName: "launchAndBuy",
        // params, configId, pairToken, quoteIn, minTokensOut, recipient, exemptions
        args: [routerParams, launchConfigId, pairToken, initialBuy, 0n, account, []],
        value: fee + initialBuy, // native: fee + buy travel together
        summary: `Launch "${input.name}" ($${input.ticker}) + buy ${input.initialBuyEth} ETH in one tx (Pons v2).`,
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
      summary: `Launch "${input.name}" ($${input.ticker}) via Pons v2 → bonding curve (quote ${quoteLabel}).`,
      warnings,
    };
  }
}
