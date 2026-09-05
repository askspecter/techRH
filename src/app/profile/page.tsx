"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatEther } from "viem";
import { useAccount, useBalance, useDisconnect } from "wagmi";
import { robinhoodChain, explorerTx } from "@/lib/chain";
import { useCreatorFees } from "@/lib/useCreatorFees";
import { WalletButton } from "@/components/WalletButton";
import { SITE } from "@/lib/site";

interface LaunchRecord {
  token: string;
  version: "v1" | "v2";
  name: string;
  symbol: string;
  logo: string;
  deployer: string;
  txHash: string;
  createdAt: number;
}

type Tab = "positions" | "launches";

export default function ProfilePage() {
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const { eth: feeEth, claim, busy: claiming, txHash: claimTx } = useCreatorFees();
  const { data: bal } = useBalance({
    address,
    chainId: robinhoodChain.id,
    query: { enabled: Boolean(address) && isConnected },
  });

  const [ethUsd, setEthUsd] = useState<number | null>(null);
  const [launches, setLaunches] = useState<LaunchRecord[] | null>(null);
  const [tab, setTab] = useState<Tab>("launches");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("https://coins.llama.fi/prices/current/coingecko:ethereum")
      .then((r) => r.json())
      .then((d) => setEthUsd(d?.coins?.["coingecko:ethereum"]?.price ?? null))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!address) return;
    fetch("/api/launches?limit=100")
      .then((r) => r.json())
      .then((d: { items?: LaunchRecord[] }) => setLaunches(d.items ?? []))
      .catch(() => setLaunches([]));
  }, [address]);

  const myLaunches = useMemo(
    () => (launches ?? []).filter((l) => address && l.deployer?.toLowerCase() === address.toLowerCase()),
    [launches, address]
  );

  if (!isConnected || !address) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center">
        <div className="card mx-auto max-w-md p-8">
          <h1 className="font-display text-2xl font-bold text-zinc-900">Your {SITE.name} profile</h1>
          <p className="mt-2 text-sm text-zinc-600">Connect a wallet to view your fees, balance, and launches.</p>
          <div className="mt-6 flex justify-center">
            <WalletButton variant="solid" />
          </div>
        </div>
      </div>
    );
  }

  const feeUsd = ethUsd != null ? Number(formatEther(feeEth)) * ethUsd : null;
  const balNum = bal ? Number(bal.formatted) : 0;
  const balUsd = ethUsd != null ? balNum * ethUsd : null;

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(address!);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }
  async function share() {
    const url = `${window.location.origin}/profile`;
    try {
      if (navigator.share) await navigator.share({ title: `${SITE.name} profile`, url });
      else await navigator.clipboard.writeText(url);
    } catch {}
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {/* Header */}
      <section className="card p-6">
        <div className="flex items-start gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-zinc-900 text-white">
            <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 4-6 8-6s8 2 8 6" /></svg>
          </span>
          <div className="min-w-0">
            <h1 className="break-all font-mono text-lg font-bold leading-tight text-zinc-900 sm:text-2xl">
              {address}
            </h1>
            <p className="mt-1 text-sm text-zinc-500">Your {SITE.name} profile</p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <button onClick={copyAddress} className="btn-ghost !py-2 text-sm">
            {copied ? "Copied!" : "Copy address"}
          </button>
          <button onClick={share} className="btn-ghost !py-2 text-sm">Share</button>
          <button onClick={() => disconnect()} className="rounded-full border border-red-400/40 px-4 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-500/10">
            Disconnect
          </button>
        </div>
      </section>

      {/* Creator fees */}
      <section className="card mt-4 p-6">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-black/[0.04] text-zinc-700">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><ellipse cx="12" cy="6" rx="8" ry="3" /><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6" /><path d="M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" /></svg>
          </span>
          <h2 className="font-display text-lg font-bold text-zinc-900">Creator fees ready to claim</h2>
        </div>
        <div className="mt-4 rounded-2xl border border-ink-line bg-white/60 p-4">
          <div className="font-mono text-2xl font-bold text-zinc-900">{trim(formatEther(feeEth))} ETH</div>
          <div className="mt-0.5 text-sm text-zinc-500">
            {feeUsd != null ? `$${feeUsd.toLocaleString("en-US", { maximumFractionDigits: 2 })} · ` : ""}
            Across every launch paid to your wallet
          </div>
        </div>
        <button
          onClick={() => claim()}
          disabled={feeEth === 0n || claiming}
          className="btn-brand mt-4 w-full disabled:opacity-40"
        >
          {claiming ? "Claiming…" : "Claim creator fees"}
        </button>
        {claimTx && (
          <a href={explorerTx(claimTx)} target="_blank" rel="noreferrer" className="mt-2 block text-xs text-pink">
            ✓ Claim sent - view on explorer
          </a>
        )}
      </section>

      {/* Portfolio balance */}
      <section className="card mt-4 p-6">
        <p className="text-sm text-zinc-500">Portfolio balance</p>
        <div className="mt-1 font-display text-4xl font-bold text-zinc-900">
          {balUsd != null ? `$${balUsd.toLocaleString("en-US", { maximumFractionDigits: 2 })}` : `${trim(String(balNum))} ETH`}
        </div>
        <p className="mt-1 text-sm text-zinc-500">
          {trim(String(balNum))} {bal?.symbol ?? "ETH"} on {robinhoodChain.name}
        </p>
      </section>

      {/* Tabs */}
      <section className="card mt-4 overflow-hidden">
        <div className="flex gap-6 border-b border-ink-line px-6 pt-4">
          {([["positions", "Positions"], ["launches", "Launches"]] as [Tab, string][]).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`-mb-px border-b-2 pb-3 text-sm font-semibold transition ${
                tab === id ? "border-pink text-zinc-900" : "border-transparent text-zinc-500 hover:text-zinc-800"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="p-6">
          {tab === "positions" ? (
            <div className="py-6 text-center">
              <p className="font-semibold text-zinc-900">No open positions in this wallet.</p>
              <p className="mt-1 text-sm text-zinc-500">Buy a token on its page and it will show up here.</p>
              <Link href="/feed" className="btn-brand mt-5 inline-flex">Explore tokens</Link>
            </div>
          ) : myLaunches.length === 0 ? (
            <div className="py-6 text-center">
              <p className="font-semibold text-zinc-900">You haven&apos;t launched a token yet.</p>
              <p className="mt-1 text-sm text-zinc-500">Ship your first token from the studio.</p>
              <Link href="/create" className="btn-brand mt-5 inline-flex">Launch a token →</Link>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {myLaunches.map((it) => (
                <Link key={it.token} href={`/launch/${it.token}`} className="card card-hover overflow-hidden">
                  <div className="relative aspect-square bg-black/[0.03]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={it.logo || "/creo-logo.jpg"} alt={it.symbol} className="h-full w-full object-cover" />
                    <span className="chip absolute left-2 top-2 bg-white/80">{it.version}</span>
                  </div>
                  <div className="p-3">
                    <p className="truncate font-display font-bold text-zinc-900">{it.name}</p>
                    <span className="font-mono text-xs text-pink">${it.symbol}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function trim(v: string): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return v;
  if (n === 0) return "0";
  return n.toLocaleString("en-US", { maximumFractionDigits: 6 });
}
