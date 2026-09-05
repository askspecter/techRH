"use client";

import { useEffect, useMemo, useState } from "react";
import { SITE } from "@/lib/site";
import { explorerUrl } from "@/lib/chain";

type Range = "24h" | "all";

interface Metrics {
  launches: number;
  uniqueDevs: number;
  volumeUsd: number | null;
  tradesCount: number | null;
  protocolRevenueUsd: number | null;
  creatorEarningsUsd: number | null;
}
interface AnalyticsData {
  configured: boolean;
  dune: boolean;
  updatedAt: number;
  allTime: Metrics;
  day: Metrics;
  series: { ts: number; count: number }[];
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [range, setRange] = useState<Range>("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/analytics")
      .then((r) => r.json())
      .then((d: AnalyticsData) => !cancelled && setData(d))
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const m = data ? (range === "24h" ? data.day : data.allTime) : null;
  const scopeLabel = range === "24h" ? "Latest 24h" : "All time";
  const dataSub = data?.dune ? "Live from Dune" : "Needs a Dune data source";

  return (
    <div className="mx-auto max-w-5xl px-4 py-14">
      {/* Header */}
      <div className="card p-6 sm:p-8">
        <p className="eyebrow">Analytics</p>
        <h1 className="mt-3 font-display text-4xl font-bold text-zinc-900">Protocol analytics</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-600">
          Onchain reporting for {SITE.name} launches on {SITE.chain}. Launch metrics are indexed from
          tokens created through {SITE.name}.
        </p>
        <p className="mt-2 text-xs text-zinc-500">
          {data ? `Updated ${fmtEastern(data.updatedAt)} ET` : "Loading…"}
        </p>

        {/* Range toggle */}
        <div className="mt-6 grid max-w-md grid-cols-2 gap-1 rounded-full border border-ink-line bg-white/60 p-1">
          {(["24h", "all"] as Range[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`rounded-full py-2.5 text-sm font-semibold transition ${
                range === r ? "bg-zinc-900 text-white" : "text-zinc-600 hover:text-zinc-900"
              }`}
            >
              {r === "24h" ? "24h" : "All time"}
            </button>
          ))}
        </div>

        <a
          href={explorerUrl}
          target="_blank"
          rel="noreferrer"
          className="btn-ghost mt-4 w-full sm:w-auto"
        >
          View on explorer ↗
        </a>
      </div>

      {/* Stat cards */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Stat label="Token launches" value={fmtCount(m?.launches)} sub={`${scopeLabel} · via ${SITE.name}`} big />
        <Stat label="Unique token devs" value={fmtCount(m?.uniqueDevs)} sub={`${scopeLabel} · via ${SITE.name}`} big />
        <Stat label="Trading volume" value={fmtUsd(m?.volumeUsd)} sub={dataSub} muted={m?.volumeUsd == null} />
        <Stat label="Trades" value={fmtCount(m?.tradesCount)} sub={dataSub} muted={m?.tradesCount == null} />
        <Stat label="Protocol revenue" value={fmtUsd(m?.protocolRevenueUsd)} sub={dataSub} muted={m?.protocolRevenueUsd == null} />
        <Stat label="Creator earnings" value={fmtUsd(m?.creatorEarningsUsd)} sub={dataSub} muted={m?.creatorEarningsUsd == null} />
      </div>

      <p className="mt-4 text-xs leading-relaxed text-zinc-500">
        {data?.dune
          ? `Volume, trades and revenue are supplied by Dune. Launches and unique devs are indexed live from ${SITE.name}.`
          : `Launches and unique devs are indexed live from ${SITE.name}. Volume, trades, and revenue require an onchain data provider (e.g. Dune) and are not tracked yet.`}
      </p>

      {/* Launches chart */}
      <div className="card mt-6 p-6">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="font-display text-xl font-bold text-zinc-900">Token launches</h2>
            <p className="mt-1 text-sm text-zinc-600">Daily launches over the last 30 days.</p>
          </div>
          <span className="font-display text-2xl font-bold text-zinc-900">
            {fmtCount(data?.allTime.launches)}
          </span>
        </div>
        <BarChart series={data?.series ?? []} loading={loading} />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  big,
  muted,
}: {
  label: string;
  value: string;
  sub: string;
  big?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="card p-5">
      <p className="text-sm text-zinc-500">{label}</p>
      <p
        className={`mt-1 font-display font-bold tracking-tight ${
          muted ? "text-zinc-400" : "text-zinc-900"
        } ${big ? "text-4xl" : "text-3xl"}`}
      >
        {value}
      </p>
      <p className="mt-1 text-xs text-zinc-500">{sub}</p>
    </div>
  );
}

function BarChart({ series, loading }: { series: { ts: number; count: number }[]; loading: boolean }) {
  const max = useMemo(() => Math.max(1, ...series.map((s) => s.count)), [series]);
  const hasData = series.some((s) => s.count > 0);

  if (loading) {
    return <div className="mt-5 h-48 animate-pulse rounded-xl bg-black/[0.04]" />;
  }

  return (
    <div className="mt-5">
      <div className="flex h-48 items-end gap-[3px] rounded-xl border border-ink-line bg-white/40 p-3">
        {series.map((s, i) => (
          <div
            key={i}
            title={`${new Date(s.ts).toLocaleDateString()} · ${s.count} launches`}
            className="flex-1 rounded-t"
            style={{
              height: `${Math.max(2, (s.count / max) * 100)}%`,
              background: s.count > 0 ? "linear-gradient(180deg,#f2b134,#e0532a)" : "rgba(0,0,0,0.06)",
            }}
          />
        ))}
      </div>
      <div className="mt-2 flex justify-between text-xs text-zinc-500">
        <span>{series[0] ? new Date(series[0].ts).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : ""}</span>
        <span>
          {series[series.length - 1]
            ? new Date(series[series.length - 1].ts).toLocaleDateString(undefined, { month: "short", day: "numeric" })
            : ""}
        </span>
      </div>
      {!hasData && (
        <p className="mt-3 text-center text-sm text-zinc-500">
          No launches indexed yet, this fills in as tokens are created through {SITE.name}.
        </p>
      )}
    </div>
  );
}

function fmtEastern(ms: number): string {
  return new Date(ms).toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
function fmtCount(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}
function fmtUsd(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return "$" + Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 2 }).format(n);
}
