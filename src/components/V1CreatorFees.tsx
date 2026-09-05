"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { formatEther, formatUnits, isAddress, zeroAddress, type Address } from "viem";
import { v1LockerAbi } from "@/lib/pons/abis";
import { explorerTx } from "@/lib/chain";

function eq(a?: string, b?: string) {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}
function short(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}
function usd(x: number | null) {
  if (x === null) return "";
  if (x === 0) return "$0.00";
  if (x >= 0.01) return `$${x.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  return `$${x.toFixed(8).replace(/0+$/, "").replace(/\.$/, "")}`;
}

/**
 * Creator fees panel (Pons-style) for v1 tokens. Accrued fees are read by
 * simulating collectFees (eth_call); claiming runs it for real. Only the
 * creator (deployer or current fee-redirect wallet) can claim / change payout.
 */
export function V1CreatorFees({
  locker,
  token,
  symbol,
  decimals,
  isToken0,
  deployer,
  feeRedirect,
  creatorSharePercent,
  protocolSharePercent,
  tokenPriceUsd,
  ethUsd,
}: {
  locker: Address;
  token: Address;
  symbol: string;
  decimals: number;
  isToken0: boolean;
  deployer: Address;
  feeRedirect: Address;
  creatorSharePercent: number;
  protocolSharePercent: number;
  tokenPriceUsd: number | null;
  ethUsd: number | null;
}) {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const [accrTok, setAccrTok] = useState(0n);
  const [accrWeth, setAccrWeth] = useState(0n);
  const [busy, setBusy] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showChange, setShowChange] = useState(false);
  const [newWallet, setNewWallet] = useState("");

  const payout = feeRedirect && feeRedirect !== zeroAddress ? feeRedirect : deployer;
  const isCreator = eq(address, deployer) || eq(address, feeRedirect);
  const hasFees = accrTok > 0n || accrWeth > 0n;

  const loadAccrued = useCallback(async () => {
    if (!publicClient) {
      setAccrTok(0n);
      setAccrWeth(0n);
      return;
    }
    try {
      // Simulate as the payout wallet so the read passes regardless of who is
      // viewing. This keeps the panel (and the accrued amounts) visible to
      // everyone, like Pons, even when the visitor is not the creator.
      const { result } = await publicClient.simulateContract({
        address: locker,
        abi: v1LockerAbi,
        functionName: "collectFees",
        args: [token],
        account: payout,
      });
      const [a0, a1] = result as unknown as [bigint, bigint];
      setAccrTok(isToken0 ? a0 : a1);
      setAccrWeth(isToken0 ? a1 : a0);
    } catch {
      setAccrTok(0n);
      setAccrWeth(0n);
    }
  }, [publicClient, payout, locker, token, isToken0]);

  useEffect(() => {
    loadAccrued();
  }, [loadAccrued]);

  async function claim() {
    setError(null);
    setBusy(true);
    try {
      const hash = await writeContractAsync({ address: locker, abi: v1LockerAbi, functionName: "collectFees", args: [token] });
      setTxHash(hash);
      setTimeout(loadAccrued, 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message.split("\n")[0] : "Claim failed.");
    } finally {
      setBusy(false);
    }
  }

  async function changePayout() {
    if (!isAddress(newWallet)) {
      setError("Enter a valid wallet address.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const hash = await writeContractAsync({
        address: locker,
        abi: v1LockerAbi,
        functionName: "setFeeRedirect",
        args: [token, newWallet as Address],
      });
      setTxHash(hash);
      setShowChange(false);
      setNewWallet("");
    } catch (err) {
      setError(err instanceof Error ? err.message.split("\n")[0] : "Update failed.");
    } finally {
      setBusy(false);
    }
  }

  const tokNum = Number(formatUnits(accrTok, decimals));
  const wethNum = Number(formatEther(accrWeth));

  return (
    <section className="card p-5">
      <h2 className="text-sm font-medium text-zinc-700">Creator fees</h2>
      <p className="mt-1 text-xs text-zinc-500">
        Pool fees accrue without unlocking the permanent liquidity position.
      </p>

      <div className="mt-3 space-y-2">
        <AccruedRow label={`Accrued ${symbol}`} amount={tokNum} usdText={usd(tokenPriceUsd !== null ? tokNum * tokenPriceUsd : null)} />
        <AccruedRow label="Accrued WETH" amount={wethNum} usdText={usd(ethUsd !== null ? wethNum * ethUsd : null)} />
      </div>

      <p className="mt-3 text-xs text-zinc-500">
        {creatorSharePercent}% creator / {protocolSharePercent}% protocol
      </p>

      <div className="mt-3 flex items-center justify-between rounded-xl border border-ink-line px-3 py-2">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-zinc-500">Payout wallet</div>
          <div className="font-mono text-sm">{short(payout)}</div>
        </div>
        {isCreator && (
          <button className="btn-ghost !px-3 !py-1.5 text-xs" onClick={() => setShowChange((s) => !s)}>
            Change
          </button>
        )}
      </div>

      {showChange && (
        <div className="mt-2 flex gap-2">
          <input
            value={newWallet}
            onChange={(e) => setNewWallet(e.target.value.trim())}
            placeholder="0x… new payout wallet"
            className="w-full rounded-xl border border-ink-line px-3 py-2 font-mono text-xs outline-none"
          />
          <button className="btn-brand shrink-0" disabled={busy} onClick={changePayout}>
            Save
          </button>
        </div>
      )}

      {isCreator ? (
        <button className="btn-brand mt-3 w-full" disabled={busy || !hasFees} onClick={claim}>
          {busy ? "Confirm in wallet…" : hasFees ? "Claim fees" : "No fees to claim"}
        </button>
      ) : (
        <p className="mt-3 text-xs text-zinc-500">Connect the creator wallet to claim fees.</p>
      )}

      {txHash && (
        <a className="mt-2 block text-xs underline" href={explorerTx(txHash)} target="_blank" rel="noreferrer">
          ✓ Sent - view on explorer
        </a>
      )}
      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
    </section>
  );
}

function AccruedRow({ label, amount, usdText }: { label: string; amount: number; usdText: string }) {
  return (
    <div className="rounded-xl border border-ink-line px-3 py-2">
      <div className="text-[10px] uppercase tracking-widest text-zinc-500">{label}</div>
      <div className="font-mono text-lg">{amount.toLocaleString(undefined, { maximumFractionDigits: 6 })}</div>
      {usdText && <div className="text-xs text-zinc-500">{usdText}</div>}
    </div>
  );
}
