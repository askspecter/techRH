"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { formatEther, zeroAddress, type Address } from "viem";
import { v2FeeEscrowAbi } from "@/lib/pons/abisV2";
import { PONS_V2 } from "@/lib/pons";
import { explorerTx } from "@/lib/chain";

function short(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}
function eq(a?: string, b?: string) {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}

/**
 * Creator fee claiming (v2), Pons-style. Reads the CREATOR's claimable balance
 * in the fee escrow (native ETH, plus the quote asset when it isn't ETH) so the
 * amount is visible to everyone, and lets the creator withdraw. Escrow balances
 * are credited after a fee sweep, so a zero balance doesn't always mean zero
 * lifetime earnings.
 */
export function ClaimFees({ pairToken, creator }: { pairToken?: Address; creator?: Address }) {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const [eth, setEth] = useState<bigint>(0n);
  const [tokenBal, setTokenBal] = useState<bigint>(0n);
  const [busy, setBusy] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hasPairToken = !!pairToken && pairToken !== zeroAddress;
  // Whose balance to display: the creator (so it's public), falling back to the
  // connected wallet when no creator is known.
  const subject = (creator && creator !== zeroAddress ? creator : address) as Address | undefined;
  const isCreator = eq(address, creator) || (!creator && isConnected);

  const load = useCallback(async () => {
    if (!publicClient || !subject) return;
    try {
      const nativeBal = (await publicClient.readContract({
        address: PONS_V2.feeEscrow,
        abi: v2FeeEscrowAbi,
        functionName: "balanceOf",
        args: [subject],
      })) as bigint;
      setEth(nativeBal);
      if (hasPairToken) {
        const tb = (await publicClient.readContract({
          address: PONS_V2.feeEscrow,
          abi: v2FeeEscrowAbi,
          functionName: "balanceOfToken",
          args: [subject, pairToken as Address],
        })) as bigint;
        setTokenBal(tb);
      }
    } catch {
      /* ignore read errors */
    }
  }, [publicClient, subject, hasPairToken, pairToken]);

  useEffect(() => {
    load();
  }, [load]);

  async function claim(kind: "eth" | "token") {
    setError(null);
    setBusy(true);
    try {
      const hash = await writeContractAsync(
        kind === "eth"
          ? { address: PONS_V2.feeEscrow, abi: v2FeeEscrowAbi, functionName: "claim" }
          : {
              address: PONS_V2.feeEscrow,
              abi: v2FeeEscrowAbi,
              functionName: "claimToken",
              args: [pairToken as Address],
            }
      );
      setTxHash(hash);
      setTimeout(load, 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message.split("\n")[0] : "Claim failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card p-5">
      <h2 className="text-sm font-medium text-zinc-700">Creator fees</h2>
      <p className="mt-1 text-xs text-zinc-500">
        Withdraw fees credited to your wallet. Fees are credited after a sweep, so this can read zero even
        when a launch has earned.
      </p>

      <div className="mt-3 space-y-2">
        <div className="flex items-center justify-between rounded-xl border border-ink-line p-3">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-zinc-500">Claimable (ETH)</div>
            <div className="font-mono text-lg">{Number(formatEther(eth)).toFixed(6)} ETH</div>
          </div>
          <button
            className="btn-brand"
            disabled={!isCreator || busy || eth === 0n}
            onClick={() => claim("eth")}
          >
            Claim
          </button>
        </div>

        {hasPairToken && (
          <div className="flex items-center justify-between rounded-xl border border-ink-line p-3">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-zinc-500">Claimable (quote token)</div>
              <div className="font-mono text-lg">{Number(formatEther(tokenBal)).toFixed(6)}</div>
            </div>
            <button
              className="btn-brand"
              disabled={!isCreator || busy || tokenBal === 0n}
              onClick={() => claim("token")}
            >
              Claim
            </button>
          </div>
        )}
      </div>

      {creator && creator !== zeroAddress && (
        <p className="mt-2 text-xs text-zinc-500">
          Payable to <span className="font-mono">{short(creator)}</span>.{" "}
          {isCreator ? "This is your wallet." : "Connect that wallet to claim."}
        </p>
      )}
      {!isConnected && <p className="mt-2 text-xs text-zinc-500">Connect your wallet to claim.</p>}
      {txHash && (
        <a className="mt-2 block text-xs text-pink" href={explorerTx(txHash)} target="_blank" rel="noreferrer">
          ✓ Claim sent - view on explorer
        </a>
      )}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </section>
  );
}
