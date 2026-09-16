"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount, usePublicClient, useSwitchChain, useWriteContract } from "wagmi";
import { formatUnits, getAddress, type Abi, type Address } from "viem";
import { ARC } from "@/lib/o1/config";
import { robinhoodChain, explorerToken } from "@/lib/chain";

/**
 * Developer-only creator-fee claim for an o1 Arc launch.
 *
 * o1 accrues the creator's share of trading fees in the fee escrow, in the
 * quote currency (USDC). The creator reads what they're owed with
 * `owed(recipient, USDC)` and claims it with `claimTo(USDC, wallet)` — signed
 * by their own wallet. Only the launch's creator (deployer) sees this.
 *
 * If the launch designated a paired/reward token, we surface it here: the
 * claimed USDC is what buys that token (a quick buy link is shown; an on-chain
 * auto-swap can be wired later).
 */

const ESCROW_ABI = [
  { type: "function", name: "owed", stateMutability: "view", inputs: [{ name: "recipient", type: "address" }, { name: "currency", type: "address" }], outputs: [{ name: "claimableAmount", type: "uint256" }] },
  { type: "function", name: "claimTo", stateMutability: "nonpayable", inputs: [{ name: "currency", type: "address" }, { name: "destination", type: "address" }], outputs: [] },
] as const;

const ESCROW = getAddress(ARC.contracts.feeEscrow);
const USDC = getAddress(ARC.usdc.erc20);

export function O1CreatorClaim({ token, creator, rewardToken, rewardSymbol }: {
  token: string;
  creator: string;
  rewardToken?: string | null;
  rewardSymbol?: string | null;
}) {
  const { address, isConnected, chainId } = useAccount();
  const publicClient = usePublicClient();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const [owed, setOwed] = useState<bigint | null>(null);
  const [status, setStatus] = useState<"idle" | "claiming" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const isCreator = !!address && address.toLowerCase() === creator.toLowerCase();

  const refresh = useCallback(async () => {
    if (!isCreator || !publicClient) return;
    try {
      const v = await publicClient.readContract({ address: ESCROW, abi: ESCROW_ABI, functionName: "owed", args: [getAddress(creator), USDC] });
      setOwed(v as bigint);
    } catch {
      /* leave null */
    }
  }, [isCreator, publicClient, creator]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, [refresh]);

  if (!isConnected || !isCreator) return null;

  const claimable = owed != null ? Number(formatUnits(owed, ARC.usdc.erc20Decimals)) : null;

  async function claim() {
    setError(null);
    if (!address) return;
    try {
      if (chainId !== robinhoodChain.id) {
        await switchChainAsync({ chainId: robinhoodChain.id }).catch(() => {
          throw new Error(`Switch your wallet to ${robinhoodChain.name} (chain ${robinhoodChain.id}) first.`);
        });
      }
      setStatus("claiming");
      if (publicClient) {
        await publicClient.simulateContract({ account: address, address: ESCROW, abi: ESCROW_ABI as Abi, functionName: "claimTo", args: [USDC, address as Address] });
      }
      await writeContractAsync({ address: ESCROW, abi: ESCROW_ABI as Abi, functionName: "claimTo", args: [USDC, address as Address], chainId: robinhoodChain.id });
      setStatus("done");
      setTimeout(refresh, 4000);
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message.split("\n")[0] : "Claim failed.");
    }
  }

  const reward = rewardToken && /^0x[0-9a-fA-F]{40}$/.test(rewardToken) ? getAddress(rewardToken) : null;

  return (
    <section className="card p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-700">💸 Creator fees</h2>
        <span className="chip">developer</span>
      </div>
      <p className="mt-2 text-xs text-zinc-500">
        Your share of trading fees on this launch, accrued in USDC on o1. Only you (the creator) see this.
      </p>

      <div className="mt-4 flex items-end justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-zinc-500">Claimable</p>
          <p className="font-display text-2xl font-bold text-zinc-900">
            {claimable != null ? `${claimable.toLocaleString("en-US", { maximumFractionDigits: 4 })} USDC` : "…"}
          </p>
        </div>
        <button
          className="btn-brand"
          disabled={status === "claiming" || (claimable != null && claimable <= 0)}
          onClick={claim}
        >
          {status === "claiming" ? "Claiming…" : status === "done" ? "Claimed ✓" : "Claim"}
        </button>
      </div>

      {reward && (
        <p className="mt-3 text-xs text-zinc-600">
          Paired reward token:{" "}
          <a className="font-mono text-rose underline decoration-dotted" href={explorerToken(reward)} target="_blank" rel="noreferrer">
            {rewardSymbol ? `$${rewardSymbol}` : `${reward.slice(0, 6)}…${reward.slice(-4)}`}
          </a>{" "}
          — use your claimed USDC to buy it.
        </p>
      )}
      {status === "done" && <p className="mt-2 text-xs text-green-600">Claimed to your wallet.</p>}
      {error && <p className="mt-2 whitespace-pre-wrap text-xs text-red-600">{error}</p>}
    </section>
  );
}
