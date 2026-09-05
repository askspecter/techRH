"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { explorerTx } from "@/lib/chain";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { isVerified } from "@/lib/verified";
import { OFFICIAL_TOKEN } from "@/lib/site";

interface LaunchRecord {
  token: string;
  curve?: string;
  version: "v1" | "v2";
  name: string;
  symbol: string;
  logo: string;
  twitter?: string;
  telegram?: string;
  website?: string;
  deployer: string;
  txHash: string;
  createdAt: number;
}

export default function FeedPage() {
  const [items, setItems] = useState<LaunchRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/launches?limit=60")
      .then((r) => r.json())
      .then((d: { items?: LaunchRecord[]; error?: string }) => {
        if (d.error) setError(d.error);
        setItems(withOfficial(d.items ?? []));
      })
      .catch(() => setItems(withOfficial([])));
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <div className="animate-fade-up">
        <p className="eyebrow">Live</p>
        <h1 className="mt-2 font-display text-4xl font-bold text-zinc-900">The feed</h1>
        <p className="mt-2 max-w-xl text-sm text-zinc-600">
          Tokens launched through CREO, newest first. Every one deployed straight to Pons.
        </p>
      </div>

      {error && <p className="mt-8 text-sm text-red-600">{error}</p>}

      {items === null && !error && (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card h-40 animate-pulse" />
          ))}
        </div>
      )}

      {items && items.length === 0 && !error && (
        <div className="card mt-8 p-10 text-center">
          <p className="text-lg font-semibold text-zinc-900">No launches yet.</p>
          <p className="mt-2 text-sm text-zinc-600">
            Be the first - open the studio and ship a token.
          </p>
          <a href="/create" className="btn-brand mt-6 inline-flex">Launch a token →</a>
        </div>
      )}

      {items && items.length > 0 && (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((it) => (
            <div key={it.token} className="card card-hover flex flex-col p-4">
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={it.logo || "/creo-logo.jpg"}
                  alt={it.symbol}
                  className="h-12 w-12 rounded-xl border border-ink-line object-cover"
                />
                <div className="min-w-0">
                  <p className="flex items-center gap-1 truncate font-display font-bold text-zinc-900">
                    <span className="truncate">{it.name}</span>
                    {isVerified(it.token) && <VerifiedBadge className="text-base" />}
                  </p>
                  <p className="font-mono text-xs text-zinc-500">${it.symbol}</p>
                </div>
                <span className="chip ml-auto">{it.version}</span>
              </div>

              <div className="mt-4 flex items-center justify-between text-xs text-zinc-500">
                <span className="font-mono">{shortAddr(it.deployer)}</span>
                <span>{timeAgo(it.createdAt)}</span>
              </div>

              <div className="mt-3 flex gap-2">
                <Link href={`/launch/${it.token}`} className="btn-brand flex-1 !py-2 text-xs">
                  Trade →
                </Link>
                <a href={explorerTx(it.txHash)} target="_blank" rel="noreferrer" className="btn-ghost !py-2 text-xs">
                  Tx
                </a>
                {it.twitter && (
                  <a href={normalizeX(it.twitter)} target="_blank" rel="noreferrer" className="btn-ghost !py-2 text-xs">
                    X
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Prepend the official token (deduped) so the flagship always shows. */
function withOfficial(items: LaunchRecord[]): LaunchRecord[] {
  const addr = OFFICIAL_TOKEN.address.toLowerCase();
  if (items.some((i) => i.token.toLowerCase() === addr)) return items;
  const official: LaunchRecord = {
    token: OFFICIAL_TOKEN.address,
    version: OFFICIAL_TOKEN.version,
    name: OFFICIAL_TOKEN.name,
    symbol: OFFICIAL_TOKEN.symbol,
    logo: OFFICIAL_TOKEN.logo,
    deployer: "",
    txHash: "",
    createdAt: Date.now(),
  };
  return [official, ...items];
}

function shortAddr(a: string): string {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "";
}

function timeAgo(ts: number): string {
  if (!ts) return "";
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function normalizeX(handle: string): string {
  const h = handle.trim();
  if (h.startsWith("http")) return h;
  return `https://x.com/${h.replace(/^@/, "")}`;
}
