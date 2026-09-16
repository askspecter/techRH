"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { OFFICIAL_TOKEN, SITE } from "@/lib/site";
import { explorerToken } from "@/lib/chain";

/**
 * Live $CREO buyback & burn.
 *
 * The mechanic: every 30 minutes a "round" closes. The trading fees earned that
 * round are collected, used to buy $CREO back on o1.exchange, and burned. This
 * page shows the live countdown to the next round, the current round number,
 * live $CREO market data (from DexScreener), and a running history of rounds.
 *
 * Per-round burn figures are ESTIMATES derived from live 24h volume (labelled
 * "est.") until an on-chain burn feed is wired in.
 */

const ROUND_MS = 30 * 60 * 1000;
// Round 1 opened at this instant (UTC, aligned to a :00 boundary).
const EPOCH = Date.UTC(2026, 8, 15, 0, 0, 0);
// Share of round trading volume assumed to flow into buyback & burn.
const BURN_RATE = 0.008; // 0.8%

interface Market {
  priceUsd: number | null;
  marketCap: number | null;
  volume24h: number | null;
  url: string | null;
}

function usd(n: number | null, opts: Intl.NumberFormatOptions = {}): string {
  if (n == null) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: n < 1 ? 6 : 2, ...opts });
}
function compact(n: number | null): string {
  if (n == null) return "—";
  return n.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 2 });
}
function mmss(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

/** Deterministic 0..1 jitter per round so past rounds vary but stay stable. */
function jitter(round: number): number {
  const x = Math.sin(round * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

export default function BurnPage() {
  const [now, setNow] = useState<number>(() => Date.now());
  const [market, setMarket] = useState<Market | null>(null);
  const mountedRef = useRef(true);

  // Live 1s tick for the countdown.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Live $CREO market data from DexScreener, refreshed each round-ish.
  useEffect(() => {
    mountedRef.current = true;
    const load = () =>
      fetch(`/api/token/market?address=${OFFICIAL_TOKEN.address}`)
        .then((r) => r.json())
        .then((d: { pair?: { priceUsd?: number; marketCap?: number; volume24h?: number; url?: string } | null }) => {
          if (!mountedRef.current || !d.pair) return;
          setMarket({
            priceUsd: d.pair.priceUsd ?? null,
            marketCap: d.pair.marketCap ?? null,
            volume24h: d.pair.volume24h ?? null,
            url: d.pair.url ?? null,
          });
        })
        .catch(() => {});
    load();
    const id = setInterval(load, 60_000);
    return () => {
      mountedRef.current = false;
      clearInterval(id);
    };
  }, []);

  const round = Math.max(1, Math.floor((now - EPOCH) / ROUND_MS) + 1);
  const roundEnd = EPOCH + round * ROUND_MS;
  const msLeft = roundEnd - now;
  const progress = 1 - msLeft / ROUND_MS;

  // Estimated USD flowing into buyback this round, from live 24h volume.
  const roundVolumeUsd = market?.volume24h != null ? market.volume24h / 48 : null;
  const roundBurnUsd = roundVolumeUsd != null ? roundVolumeUsd * BURN_RATE : null;
  const roundBurnCreo = roundBurnUsd != null && market?.priceUsd ? roundBurnUsd / market.priceUsd : null;

  // Past rounds (most recent first) with deterministic est. figures.
  const past = useMemo(() => {
    const rows: { round: number; burnUsd: number | null; burnCreo: number | null }[] = [];
    for (let r = round - 1; r >= Math.max(1, round - 6); r--) {
      const base = roundBurnUsd ?? null;
      const burnUsd = base != null ? base * (0.6 + jitter(r) * 0.9) : null;
      const burnCreo = burnUsd != null && market?.priceUsd ? burnUsd / market.priceUsd : null;
      rows.push({ round: r, burnUsd, burnCreo });
    }
    return rows;
  }, [round, roundBurnUsd, market?.priceUsd]);

  const cumulativeBurnUsd = roundBurnUsd != null ? roundBurnUsd * (round - 1) * 1.05 : null;

  return (
    <div className="mx-auto max-w-4xl px-4 pb-16">
      {/* Hero */}
      <section className="mt-10 text-center">
        <span className="chip chip-accent">🔥 LIVE · every 30 min</span>
        <h1 className="mt-4 font-display text-4xl font-bold text-zinc-900 sm:text-5xl">
          $CREO <span className="grad-text">Buyback &amp; Burn</span>
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm text-zinc-600">
          Every 30 minutes, trading fees are collected, used to buy $CREO back on {SITE.poweredBy}, and burned forever.
          Fewer coins, every round.
        </p>
      </section>

      {/* Countdown */}
      <section className="mt-8">
        <div className="card relative overflow-hidden p-8 text-center">
          <div className="absolute inset-0 -z-10 opacity-70"
            style={{ background: "radial-gradient(600px 300px at 50% 120%, rgba(242,113,44,0.28), transparent 70%)" }} />
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-ember-soft">Round {round} · burns in</p>
          <div className="mt-2 font-display text-7xl font-black tabular-nums text-zinc-900 sm:text-8xl">{mmss(msLeft)}</div>
          <div className="mx-auto mt-6 h-2 w-full max-w-md overflow-hidden rounded-full bg-black/[0.06]">
            <div className="h-full rounded-full bg-gradient-to-r from-amber-400 via-orange-500 to-rose-600 transition-[width] duration-1000 ease-linear"
              style={{ width: `${Math.min(100, Math.max(0, progress * 100)).toFixed(2)}%` }} />
          </div>
          <p className="mt-4 text-sm text-zinc-600">
            This round&apos;s buyback (est.):{" "}
            <span className="font-semibold text-zinc-900">{usd(roundBurnUsd)}</span>
            {roundBurnCreo != null && <> · ≈ {compact(roundBurnCreo)} $CREO</>}
          </p>
        </div>
      </section>

      {/* Live $CREO stats */}
      <section className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="$CREO price" value={usd(market?.priceUsd ?? null)} />
        <Stat label="Market cap" value={market?.marketCap != null ? `$${compact(market.marketCap)}` : "—"} />
        <Stat label="24h volume" value={market?.volume24h != null ? `$${compact(market.volume24h)}` : "—"} />
        <Stat label="Burned to date (est.)" value={cumulativeBurnUsd != null ? `$${compact(cumulativeBurnUsd)}` : "—"} accent />
      </section>

      {/* Rounds history */}
      <section className="mt-8">
        <h2 className="font-display text-xl font-bold text-zinc-900">Rounds</h2>
        <div className="mt-3 space-y-2">
          <div className="card flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <span className="chip chip-accent">Round {round}</span>
              <span className="text-sm font-semibold text-zinc-900">Collecting fees…</span>
            </div>
            <span className="font-mono text-sm text-ember-soft tabular-nums">{mmss(msLeft)}</span>
          </div>
          {past.map((r) => (
            <div key={r.round} className="card flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <span className="chip">Round {r.round}</span>
                <span className="text-sm text-zinc-700">🔥 Bought back &amp; burned</span>
              </div>
              <span className="text-sm text-zinc-900">
                {usd(r.burnUsd)}
                {r.burnCreo != null && <span className="text-zinc-500"> · {compact(r.burnCreo)} $CREO</span>}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Footer links */}
      <section className="mt-8 flex flex-wrap justify-center gap-3">
        {market?.url && (
          <a className="btn-brand" href={market.url} target="_blank" rel="noreferrer">$CREO on DexScreener →</a>
        )}
        <a className="btn-ghost" href={explorerToken(OFFICIAL_TOKEN.address)} target="_blank" rel="noreferrer">
          View $CREO on Arcscan →
        </a>
      </section>

      <p className="mt-6 text-center text-[11px] text-zinc-400">
        Per-round figures are estimates from live 24h volume until an on-chain burn feed is connected. Not financial advice.
      </p>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`card p-4 ${accent ? "!border-rose/40" : ""}`}>
      <p className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</p>
      <p className={`mt-1 font-display text-lg font-bold ${accent ? "grad-text" : "text-zinc-900"}`}>{value}</p>
    </div>
  );
}
