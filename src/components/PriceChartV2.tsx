"use client";

import { useEffect, useState } from "react";

interface Point {
  block: number;
  price: number;
  priceUsd: number | null;
}

/**
 * v2 price chart, drawn from the bonding curve's trade history (CurveBuy /
 * CurveSell). Mirrors the v1 PriceChart: USD when the quote is native ETH,
 * otherwise price in the quote asset.
 */
export function PriceChartV2({ token }: { token: string }) {
  const [points, setPoints] = useState<Point[] | null>(null);
  const [quoteSymbol, setQuoteSymbol] = useState("ETH");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/v2/token/chart?address=${token}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setPoints(d.points ?? []);
        if (d.quoteSymbol) setQuoteSymbol(d.quoteSymbol);
      })
      .catch(() => !cancelled && setPoints([]));
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <section className="card p-5">
      <h2 className="text-sm font-medium text-zinc-700">Price</h2>
      {points === null ? (
        <div className="mt-3 h-44 animate-pulse rounded-xl bg-black/[0.04]" />
      ) : (
        <Chart points={points} quoteSymbol={quoteSymbol} />
      )}
    </section>
  );
}

function Chart({ points, quoteSymbol }: { points: Point[]; quoteSymbol: string }) {
  const useUsd = points.length > 0 && points.every((p) => p.priceUsd !== null);
  const vals = points.map((p) => (useUsd ? (p.priceUsd as number) : p.price));
  const W = 600;
  const H = 176;
  const pad = 10;

  // Always draw a visible line. With 0-1 trades there's no slope yet, so draw a
  // flat baseline across the middle (like Pons) instead of hiding the chart.
  const min = vals.length ? Math.min(...vals) : 0;
  const max = vals.length ? Math.max(...vals) : 1;
  const range = max - min || 1;
  const flat = vals.length < 2;

  const pointFor = (v: number, i: number, n: number) => {
    const x = pad + (n <= 1 ? 0 : (i / (n - 1)) * (W - pad * 2));
    const y = flat ? H * 0.62 : pad + (1 - (v - min) / range) * (H - pad * 2);
    return [x, y] as const;
  };

  const drawn = flat
    ? [pointFor(0, 0, 2), pointFor(0, 1, 2)] // straight line edge-to-edge
    : vals.map((v, i) => pointFor(v, i, vals.length));

  const line = drawn.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${(W - pad).toFixed(1)},${H} L${pad},${H} Z`;

  const last = vals.length ? vals[vals.length - 1] : 0;
  const first = vals.length ? vals[0] : 0;
  const change = first > 0 ? ((last - first) / first) * 100 : 0;
  const up = change >= 0;

  return (
    <div>
      <div className="mt-1 flex items-baseline gap-3">
        <span className="text-2xl font-black tracking-tight text-zinc-900">
          {useUsd ? `$${fmt(last)}` : `${fmt(last)} ${quoteSymbol}`}
        </span>
        {!flat && (
          <span className={`text-sm font-semibold ${up ? "text-emerald-600" : "text-red-600"}`}>
            {up ? "▲" : "▼"} {Math.abs(change).toFixed(1)}%
          </span>
        )}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 h-44 w-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id="pxfill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#e0532a" stopOpacity="0.18" />
            <stop offset="1" stopColor="#e0532a" stopOpacity="0" />
          </linearGradient>
        </defs>
        {!flat && <path d={area} fill="url(#pxfill)" stroke="none" />}
        <path d={line} fill="none" stroke="#e0532a" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <p className="mt-1 text-[10px] text-zinc-500">
        {flat ? "Live price · history builds as the curve trades." : `${points.length} curve trades · from on-chain events`}
      </p>
    </div>
  );
}

function fmt(x: number): string {
  if (x >= 1) return x.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return x.toFixed(12).replace(/0+$/, "").replace(/\.$/, "");
}
