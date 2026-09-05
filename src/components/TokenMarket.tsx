"use client";

import { useEffect, useState } from "react";
import { explorerToken } from "@/lib/chain";
import { isVerified } from "@/lib/verified";
import { VerifiedBadge } from "./VerifiedBadge";

interface Pair {
  chainId: string;
  dexId: string;
  pairAddress: string;
  url: string;
  priceUsd: number | null;
  marketCap: number | null;
  fdv: number | null;
  volume24h: number | null;
  priceChange24h: number | null;
  liquidityUsd: number | null;
  name: string | null;
  symbol: string | null;
  quoteSymbol: string | null;
  image: string | null;
}

/**
 * DexScreener-backed market panel: price, market cap and 24h volume tiles plus
 * the live DexScreener candlestick chart. Works for any token with a DEX market
 * (independent of whether it launched through Pons). Renders a compact header
 * (logo, name, ticker, CA) when `showHeader` is set - used for tokens the Pons
 * readers can't resolve. Shows a quiet note when no market is found.
 */
export function TokenMarket({ address, showHeader = false }: { address: string; showHeader?: boolean }) {
  const [pair, setPair] = useState<Pair | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/token/market?address=${address}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (alive) setPair(d?.pair ?? null);
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [address]);

  if (loading) {
    return <div className="card h-48 animate-pulse" />;
  }

  if (!pair) {
    if (!showHeader) return null;
    return (
      <section className="card p-5">
        <div className="flex items-center gap-3">
          <TokenLogo src="" symbol="?" />
          <div className="min-w-0">
            <a className="truncate font-mono text-xs text-zinc-500 hover:underline" href={explorerToken(address)} target="_blank" rel="noreferrer">
              {short(address)}
            </a>
          </div>
        </div>
        <p className="mt-3 text-sm text-zinc-500">No DEX market found for this token yet.</p>
      </section>
    );
  }

  const change = pair.priceChange24h;

  return (
    <>
      {showHeader && (
        <section className="card p-5">
          <div className="flex items-center gap-4">
            <TokenLogo src={pair.image ?? ""} symbol={pair.symbol ?? "?"} />
            <div className="min-w-0 flex-1">
              <h1 className="flex items-center gap-1.5 text-xl font-black uppercase tracking-tight">
                <span className="truncate">{pair.name ?? pair.symbol ?? "Token"}</span>
                {isVerified(address) && <VerifiedBadge />}
                {pair.symbol && <span className="font-mono text-zinc-600">${pair.symbol}</span>}
              </h1>
              <div className="mt-0.5 flex items-center gap-2">
                <a className="truncate font-mono text-xs text-zinc-500 hover:underline" href={explorerToken(address)} target="_blank" rel="noreferrer">
                  {short(address)}
                </a>
                <CopyButton value={address} />
                {pair.quoteSymbol && <span className="chip chip-accent">Paired with {pair.quoteSymbol}</span>}
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="card p-5">
        <div className="grid grid-cols-3 gap-3">
          <Tile label="Price">{fmtUsd(pair.priceUsd)}</Tile>
          <Tile label="Market cap">{fmtUsdCompact(pair.marketCap)}</Tile>
          <Tile label="Volume 24h">{fmtUsdCompact(pair.volume24h)}</Tile>
        </div>
        {change != null && (
          <p className={`mt-3 font-mono text-xs ${change >= 0 ? "text-green-600" : "text-red-500"}`}>
            {change >= 0 ? "▲" : "▼"} {Math.abs(change).toFixed(2)}% (24h)
          </p>
        )}
      </section>

      <section className="card overflow-hidden p-0">
        <div className="relative w-full" style={{ height: 460 }}>
          <iframe
            title="DexScreener chart"
            src={`https://dexscreener.com/${pair.chainId}/${pair.pairAddress}?embed=1&theme=light&info=0&trades=0`}
            className="absolute inset-0 h-full w-full"
            style={{ border: 0 }}
          />
        </div>
        <a
          href={pair.url}
          target="_blank"
          rel="noreferrer"
          className="block border-t border-ink-line px-4 py-2.5 text-center text-xs font-semibold text-pink hover:underline"
        >
          View on DexScreener →
        </a>
      </section>
    </>
  );
}

function Tile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-ink-line bg-white/60 p-3">
      <div className="text-[10px] uppercase tracking-widest text-zinc-500">{label}</div>
      <div className="mt-0.5 font-mono text-sm font-bold text-zinc-900">{children}</div>
    </div>
  );
}

function TokenLogo({ src, symbol }: { src: string; symbol: string }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) {
    return (
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-pink to-rose text-lg font-black text-white">
        {symbol.slice(0, 3).toUpperCase()}
      </span>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={symbol} className="h-16 w-16 rounded-2xl object-cover" onError={() => setBroken(true)} />;
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="shrink-0 rounded-md border border-ink-line px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-700 hover:bg-zinc-900 hover:text-white"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        } catch {
          /* ignore */
        }
      }}
    >
      {copied ? "Copied" : "Copy CA"}
    </button>
  );
}

function short(a: string): string {
  return a ? `${a.slice(0, 10)}…${a.slice(-8)}` : "-";
}

function fmtUsd(x: number | null): string {
  if (x == null || !isFinite(x)) return "-";
  if (x === 0) return "$0";
  if (x >= 1) return `$${x.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  return `$${x.toFixed(12).replace(/0+$/, "").replace(/\.$/, "")}`;
}

function fmtUsdCompact(x: number | null): string {
  if (x == null || !isFinite(x)) return "-";
  if (x < 1000) return `$${x.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  return `$${x.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 1 })}`;
}
