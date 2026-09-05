import { parseEther, toHex, type Address } from "viem";
import { v1LaunchAbi } from "./abis";
import { PONS_V1, REGISTRY } from "./registry";
import type { LaunchStrategy } from "./strategy";
import { V1_QUOTE_ASSETS, type LaunchInput, type LaunchPlan, type VersionInfo } from "./types";

/**
 * Pons v1 - one transaction deploys the token AND a Uniswap V3 pool that is
 * locked immediately, quoted against WETH, pool fee 10000 (1%), fixed supply
 * 1e9, flat launch fee 0.0005 ETH. No bonding curve; tradable from block one.
 *
 * Deploy uses the VERIFIED launchToken() write path. v1 is open (no whitelist),
 * so this is the immediately-deployable path for anyone.
 */
export class PonsV1Adapter implements LaunchStrategy {
  info(): VersionInfo {
    const cfg = REGISTRY.v1;
    return {
      version: "v1",
      label: "v1 · Instant Pool",
      liquidity: "Instantly tradable in a Uniswap V3 pool (WETH), 1% fee",
      quoteAssets: V1_QUOTE_ASSETS,
      graduation: "in-place (same pool)",
      ready: cfg.factory !== "" && cfg.launchAbiVerified,
      note: "Instant pool, tradable at launch. Supply 1e9, fee 0.0005 ETH. Open - no whitelist.",
    };
  }

  async prepareLaunch(input: LaunchInput, account: Address): Promise<LaunchPlan> {
    const cfg = REGISTRY.v1;
    if (!cfg.launchAbiVerified || cfg.factory === "") {
      throw new Error("v1 deploy is not enabled.");
    }

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
      feeWallet: account, // creator fee recipient
    };

    const launchConfigId = BigInt(input.launchConfigId ?? 0);
    const dexId = 0n; // default DEX target
    // Fresh 32-byte salt avoids "already exists" collisions on identical terms.
    const salt = toHex(crypto.getRandomValues(new Uint8Array(32)));

    // Optional dev buy: the factory uses value beyond the launch fee to buy
    // tokens for the deployer at launch (recorded as initialBuyAmount).
    const devBuy = input.initialBuyEth ? parseEther(input.initialBuyEth) : 0n;
    const value = PONS_V1.launchFeeWei + devBuy;

    return {
      address: cfg.factory as `0x${string}`,
      abi: v1LaunchAbi,
      functionName: "launchToken",
      args: [params, launchConfigId, dexId, salt],
      value,
      summary:
        devBuy > 0n
          ? `Deploy "${input.name}" ($${input.ticker}) via Pons v1 + dev buy ${input.initialBuyEth} ETH.`
          : `Deploy "${input.name}" ($${input.ticker}) via Pons v1 → Uniswap V3 pool (WETH).`,
      warnings: [],
    };
  }
}
