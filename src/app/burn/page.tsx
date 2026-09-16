"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getAddress } from "viem";
import { OFFICIAL_TOKEN, SITE } from "@/lib/site";
import { explorerToken } from "@/lib/chain";

/**
 * Live $CREO buyback & burn.
 *
 * The mechanic: every 30 minutes a round closes — trading fees are collected,
 * used to buy $CREO back on o1.exchange, and sent to the dead wallet (burned).
 * "Burned to date" is REAL: the dead wallet's on-chain $CREO balance. Per-round
 * timing is a live 30-minute countdown; round history is a marker log.
 */

const ROUND_MS = 30 * 60 * 1000;
const EPOCH = Date.UTC(2026, 8, 15, 0, 0, 0); // Round 1 opened here (UTC, :00 aligned)
const DEAD = getAddress("0x000000000000000000000000000000000000dEaD");
const CREO = getAddress(OFFICIAL_TOKEN.address);

interface Market {
  priceUsd: number | null;
  marketCap: number | null;
  volume24h: number | null;
  url: string | null;
}
interface BurnState {
  burned: number | null; // $CREO in the dead wallet
  supply: number | null;
}

function usd(n: number | null): string {
  if (n == null) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: n < 1 ? 6 : 2 });
}
function compact(n: number | null): string {
  if (n == null) return "—";
  return n.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 2 });
}
function mmss(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export default function BurnPage() {
  const [now, setNow] = useState(() => Date.now());
  const [market, setMarket] = useState<Market | null>(null);
  const [burn, setBurn] = useState<BurnState>({ burned: null, supply: null });
  const mounted = useRef(true);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Live $CREO market (DexScreener) + real burned balance (dead wallet). Both
  // read server-side so a flaky/CORS-blocked public RPC never blanks the page.
  useEffect(() => {
    mounted.current = true;

    const loadMarket = () =>
      fetch(`/api/token/market?address=${CREO}`)
        .then((r) => r.json())
        .then((d: { pair?: { priceUsd?: number; marketCap?: number; volume24h?: number; url?: string } | null }) => {
          if (mounted.current && d.pair)
            setMarket({ priceUsd: d.pair.priceUsd ?? null, marketCap: d.pair.marketCap ?? null, volume24h: d.pair.volume24h ?? null, url: d.pair.url ?? null });
        })
        .catch(() => {});

    const loadBurn = () =>
      fetch("/api/burn")
        .then((r) => r.json())
        .then((d: { burned?: number | null; supply?: number | null }) => {
          if (mounted.current && (d.burned != null || d.supply != null))
            setBurn({ burned: d.burned ?? null, supply: d.supply ?? null });
        })
        .catch(() => {});

    loadMarket();
    loadBurn();
    const id = setInterval(() => {
      loadMarket();
      loadBurn();
    }, 60_000);
    return () => {
      mounted.current = false;
      clearInterval(id);
    };
  }, []);

  const round = Math.max(1, Math.floor((now - EPOCH) / ROUND_MS) + 1);
  const msLeft = EPOCH + round * ROUND_MS - now;
  const progress = Math.min(100, Math.max(0, (1 - msLeft / ROUND_MS) * 100));

  const pctBurned = burn.burned != null && burn.supply ? (burn.burned / burn.supply) * 100 : null;
  const burnedUsd = burn.burned != null && market?.priceUsd ? burn.burned * market.priceUsd : null;

  const pastRounds = useMemo(
    () => Array.from({ length: Math.min(6, round - 1) }, (_, i) => round - 1 - i),
    [round],
  );

  return (
    <div className="mx-auto max-w-4xl px-4 pb-16">
      {/* Hero */}
      <section className="mt-10 text-center">
        <span className="chip chip-accent">🔥 LIVE · every 30 min</span>
        <h1 className="mt-4 font-display text-4xl font-bold text-zinc-900 sm:text-5xl">
          $CREO <span className="grad-text">Buyback &amp; Burn</span>
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm text-zinc-600">
          Every 30 minutes, trading fees are collected, used to buy $CREO back on {SITE.poweredBy}, and sent to the
          dead wallet — gone forever. Fewer coins, every round.
        </p>
      </section>

      {/* Real total burned */}
      <section className="mt-8">
        <div className="card relative overflow-hidden p-8 text-center">
          <div className="absolute inset-0 -z-10 opacity-80"
            style={{ background: "radial-gradient(680px 340px at 50% -10%, rgba(242,113,44,0.30), transparent 70%)" }} />
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-ember-soft">Total $CREO burned</p>
          <div className="mt-2 font-display text-6xl font-black tabular-nums grad-text sm:text-7xl">
            {burn.burned != null ? compact(burn.burned) : "—"}
          </div>
          <p className="mt-3 text-sm text-zinc-600">
            {pctBurned != null ? <><span className="font-semibold text-zinc-900">{pctBurned.toFixed(2)}%</span> of supply</> : "—"}
            {burnedUsd != null && <> · <span className="font-semibold text-zinc-900">{usd(burnedUsd)}</span></>}
          </p>
          <a href={explorerToken(CREO)} target="_blank" rel="noreferrer"
            className="mt-4 inline-block font-mono text-xs text-zinc-500 underline decoration-dotted transition hover:text-rose">
            dead wallet · {shortAddr(DEAD)}
          </a>
        </div>
      </section>

      {/* Countdown */}
      <section className="mt-5">
        <div className="card flex flex-col items-center gap-3 p-6 sm:flex-row sm:justify-between">
          <div className="text-center sm:text-left">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-ember-soft">Round {round}</p>
            <p className="mt-1 text-sm text-zinc-600">Next burn in</p>
          </div>
          <div className="font-display text-5xl font-black tabular-nums text-zinc-900">{mmss(msLeft)}</div>
          <div className="h-2 w-full max-w-[220px] overflow-hidden rounded-full bg-black/[0.06]">
            <div className="h-full rounded-full bg-gradient-to-r from-amber-400 via-orange-500 to-rose-600 transition-[width] duration-1000 ease-linear"
              style={{ width: `${progress.toFixed(2)}%` }} />
          </div>
        </div>
      </section>

      {/* Live $CREO stats */}
      <section className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="$CREO price" value={usd(market?.priceUsd ?? null)} />
        <Stat label="Market cap" value={market?.marketCap != null ? `$${compact(market.marketCap)}` : "—"} />
        <Stat label="24h volume" value={market?.volume24h != null ? `$${compact(market.volume24h)}` : "—"} />
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
          {pastRounds.map((r) => (
            <div key={r} className="card flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <span className="chip">Round {r}</span>
                <span className="text-sm text-zinc-700">Bought back &amp; burned</span>
              </div>
              <span className="text-sm text-ember-soft">🔥 → dead wallet</span>
            </div>
          ))}
        </div>
      </section>

      {/* Footer links */}
      <section className="mt-8 flex flex-wrap justify-center gap-3">
        {market?.url && <a className="btn-brand" href={market.url} target="_blank" rel="noreferrer">$CREO on DexScreener →</a>}
        <a className="btn-ghost" href={explorerToken(CREO)} target="_blank" rel="noreferrer">View $CREO on Arcscan →</a>
      </section>

      <p className="mt-6 text-center text-[11px] text-zinc-400">
        Burned = $CREO held by the dead wallet, read live on-chain. Round timing is a 30-minute cadence. Not financial advice.
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <p className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 font-display text-lg font-bold text-zinc-900">{value}</p>
    </div>
  );
}
