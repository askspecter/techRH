"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { SITE, OFFICIAL_TOKEN } from "@/lib/site";
import { AssetLogo } from "@/components/AssetLogo";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { isVerified } from "@/lib/verified";

const RWA = ["ETH", "USDG", "NVDA", "AAPL", "TSLA", "HOOD", "COIN", "META", "AMZN", "MSFT", "GOOGL", "SPY"];

interface LaunchRecord {
  token: string;
  curve?: string;
  version: "v1" | "v2";
  name: string;
  symbol: string;
  logo: string;
  deployer: string;
  txHash: string;
  createdAt: number;
}

interface TokenStat {
  marketCapUsd: number | null;
  volumeUsd: number | null;
}

type Sort = "newest" | "oldest" | "mcap" | "volume";
type Ver = "all" | "v1" | "v2";

export default function HomePage() {
  const [items, setItems] = useState<LaunchRecord[] | null>(null);
  const [stats, setStats] = useState<Record<string, TokenStat>>({});
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("newest");
  const [ver, setVer] = useState<Ver>("all");

  useEffect(() => {
    fetch("/api/launches?limit=60")
      .then((r) => r.json())
      .then((d: { items?: LaunchRecord[] }) => setItems(withOfficial(d.items ?? [])))
      .catch(() => setItems(withOfficial([])));
  }, []);

  // Market cap + volume for the loaded tokens (cached server-side).
  useEffect(() => {
    if (!items || items.length === 0) return;
    const tokens = items.slice(0, 24).map((i) => ({ token: i.token, curve: i.curve, version: i.version }));
    fetch("/api/launches/stats", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tokens }),
    })
      .then((r) => r.json())
      .then((d: { stats?: Record<string, TokenStat> }) => setStats(d.stats ?? {}))
      .catch(() => {});
  }, [items]);

  const shown = useMemo(() => {
    let list = items ?? [];
    if (ver !== "all") list = list.filter((i) => i.version === ver);
    const term = q.trim().toLowerCase();
    if (term) list = list.filter((i) => `${i.name} ${i.symbol}`.toLowerCase().includes(term));
    const metric = (r: LaunchRecord, key: "marketCapUsd" | "volumeUsd") => stats[r.token]?.[key] ?? null;
    list = [...list].sort((a, b) => {
      switch (sort) {
        case "oldest":
          return a.createdAt - b.createdAt;
        case "mcap":
        case "volume": {
          const key = sort === "mcap" ? "marketCapUsd" : "volumeUsd";
          const av = metric(a, key);
          const bv = metric(b, key);
          // Highest first; unknown values sink to the bottom.
          if (av == null && bv == null) return b.createdAt - a.createdAt;
          if (av == null) return 1;
          if (bv == null) return -1;
          return bv - av;
        }
        case "newest":
        default:
          return b.createdAt - a.createdAt;
      }
    });
    // Keep the official token pinned to the front regardless of sort.
    const off = OFFICIAL_TOKEN.address.toLowerCase();
    const pinned = list.filter((r) => r.token.toLowerCase() === off);
    const rest = list.filter((r) => r.token.toLowerCase() !== off);
    return [...pinned, ...rest];
  }, [items, q, sort, ver, stats]);

  return (
    <div className="mx-auto max-w-6xl px-4">
      {/* RWA marquee */}
      <div className="marquee-mask mt-8 w-full overflow-hidden py-3">
        <div className="marquee-track gap-3">
          {[...RWA, ...RWA].map((s, i) => (
            <span key={i} className="chip flex items-center gap-2 whitespace-nowrap px-3 py-1.5 text-xs font-semibold">
              <AssetLogo symbol={s} size={18} />
              {s}
            </span>
          ))}
        </div>
      </div>

      {/* Explore */}
      <section className="mt-12 pb-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-display text-3xl font-bold text-zinc-900">Explore</h2>
              <span className="chip">{items ? `${items.length} launched` : "…"}</span>
            </div>
            <p className="mt-1 text-sm text-zinc-600">Tokens launched through {SITE.name} on {SITE.chain}.</p>
          </div>
          <Link href="/create" className="btn-brand !px-5 !py-2.5">+ Create</Link>
        </div>

        {/* Controls */}
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400">⌕</span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search tokens"
              className="field !py-2.5 pl-9"
            />
          </div>
          <Segmented
            options={[["newest", "Newest"], ["oldest", "Oldest"], ["mcap", "Market cap"], ["volume", "Volume"]]}
            value={sort}
            onChange={(v) => setSort(v as Sort)}
          />
          <Segmented
            options={[["all", "All"], ["v1", "v1"], ["v2", "v2"]]}
            value={ver}
            onChange={(v) => setVer(v as Ver)}
          />
        </div>

        {/* Grid */}
        {items === null ? (
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="card aspect-[3/4] animate-pulse" />
            ))}
          </div>
        ) : shown.length === 0 ? (
          <div className="card mt-6 p-10 text-center">
            <p className="text-lg font-semibold text-zinc-900">
              {items.length === 0 ? "No launches yet." : "No tokens match your search."}
            </p>
            <p className="mt-2 text-sm text-zinc-600">Be the first - open the studio and ship a token.</p>
            <Link href="/create" className="btn-brand mt-6 inline-flex">Launch a token →</Link>
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {shown.map((it) => (
              <Link
                key={it.token}
                href={`/launch/${it.token}`}
                className="card card-hover overflow-hidden"
              >
                <div className="relative aspect-square bg-black/[0.03]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={it.logo || "/creo-logo.jpg"}
                    alt={it.symbol}
                    className="h-full w-full object-cover"
                  />
                  <span className="chip absolute left-2 top-2 bg-white/80">{it.version}</span>
                </div>
                <div className="p-3">
                  <p className="flex items-center gap-1 truncate font-display font-bold text-zinc-900">
                    <span className="truncate">{it.name}</span>
                    {isVerified(it.token) && <VerifiedBadge className="text-base" />}
                  </p>
                  <div className="mt-0.5 flex items-center justify-between">
                    <span className="font-mono text-xs text-pink">${it.symbol}</span>
                    <span className="text-xs text-zinc-500">{timeAgo(it.createdAt)}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2 border-t border-ink-line pt-2">
                    <span className="text-[11px] text-zinc-500">
                      MC <span className="font-semibold text-zinc-800">{fmtUsdCompact(stats[it.token]?.marketCapUsd)}</span>
                    </span>
                    <span className="text-[11px] text-zinc-500">
                      Vol <span className="font-semibold text-zinc-800">{fmtUsdCompact(stats[it.token]?.volumeUsd)}</span>
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/** Prepend the official token to the launches list (deduped), so the flagship
 *  is always present in Explore even with an empty feed. */
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

function Segmented({
  options,
  value,
  onChange,
}: {
  options: [string, string][];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex w-full rounded-full border border-ink-line bg-white/60 p-1 sm:w-auto">
      {options.map(([val, label]) => (
        <button
          key={val}
          onClick={() => onChange(val)}
          className={`flex-1 whitespace-nowrap rounded-full px-2.5 py-1.5 text-xs font-semibold transition sm:flex-none sm:px-3.5 sm:text-sm ${
            value === val ? "bg-zinc-900 text-white" : "text-zinc-600 hover:text-zinc-900"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** Compact USD like $1.2K / $3.4M, or "-" when unknown. */
function fmtUsdCompact(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "-";
  if (v === 0) return "$0";
  if (v < 1000) return `$${v.toLocaleString("en-US", { maximumFractionDigits: v < 1 ? 4 : 2 })}`;
  return `$${v.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 1 })}`;
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
