"use client";

import { useEffect, useState } from "react";

interface Point {
  block: number;
  priceWeth: number;
  priceUsd: number | null;
}

export function PriceChart({ pool, isToken0 }: { pool: string; isToken0: boolean }) {
  const [points, setPoints] = useState<Point[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/token/chart?pool=${pool}&isToken0=${isToken0}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => !cancelled && setPoints(d.points ?? []))
      .catch(() => !cancelled && setPoints([]));
    return () => {
      cancelled = true;
    };
  }, [pool, isToken0]);

  return (
    <section className="card p-5">
      <h2 className="text-sm font-medium text-zinc-700">Price</h2>
      {points === null ? (
        <div className="mt-3 h-44 animate-pulse rounded-xl bg-black/[0.04]" />
      ) : (
        <Chart points={points} />
      )}
    </section>
  );
}

function Chart({ points }: { points: Point[] }) {
  const useUsd = points.length > 0 && points.every((p) => p.priceUsd !== null);
  const vals = points.map((p) => (useUsd ? (p.priceUsd as number) : p.priceWeth));
  const W = 600;
  const H = 176;
  const pad = 10;
  const min = vals.length ? Math.min(...vals) : 0;
  const max = vals.length ? Math.max(...vals) : 1;
  const range = max - min || 1;
  const flat = vals.length < 2;

  const pointFor = (v: number, i: number, n: number) => {
    const x = pad + (n <= 1 ? 0 : (i / (n - 1)) * (W - pad * 2));
    const y = flat ? H * 0.62 : pad + (1 - (v - min) / range) * (H - pad * 2);
    return [x, y] as const;
  };
  const drawn = flat ? [pointFor(0, 0, 2), pointFor(0, 1, 2)] : vals.map((v, i) => pointFor(v, i, vals.length));
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
          {useUsd ? `$${fmt(last)}` : `${fmt(last)} WETH`}
        </span>
        {!flat && (
          <span className={`text-sm font-semibold ${up ? "text-emerald-600" : "text-red-600"}`}>
            {up ? "▲" : "▼"} {Math.abs(change).toFixed(1)}%
          </span>
        )}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 h-44 w-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id="pxfill1" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#e0532a" stopOpacity="0.18" />
            <stop offset="1" stopColor="#e0532a" stopOpacity="0" />
          </linearGradient>
        </defs>
        {!flat && <path d={area} fill="url(#pxfill1)" stroke="none" />}
        <path d={line} fill="none" stroke="#e0532a" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <p className="mt-1 text-[10px] text-zinc-500">
        {flat ? "Live price · history builds as the pool trades." : `${points.length} swaps · from on-chain events`}
      </p>
    </div>
  );
}

function fmt(x: number): string {
  if (x >= 1) return x.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return x.toFixed(12).replace(/0+$/, "").replace(/\.$/, "");
}
