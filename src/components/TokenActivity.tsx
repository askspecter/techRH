"use client";

import { useEffect, useState } from "react";
import { explorerTx } from "@/lib/chain";

interface Trade {
  type: "buy" | "sell";
  account: string;
  quote: number;
  tokens: number;
  block: number;
  ts: number | null;
  txHash: string;
}

interface Activity {
  quoteSymbol: string;
  quoteIsNative: boolean;
  ethUsd: number | null;
  volume: number;
  tradeCount: number;
  trades: Trade[];
}

/**
 * Volume + trade-count tile and a recent-trades table for a v2 token, read from
 * the bonding curve's on-chain events. Mirrors the par-style token activity
 * panel. Degrades to a quiet empty state when there are no trades yet.
 */
export function TokenActivity({ token }: { token: string }) {
  const [data, setData] = useState<Activity | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/v2/token/activity?address=${token}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (alive) setData(d);
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [token]);

  const volumeUsd = data && data.quoteIsNative && data.ethUsd ? data.volume * data.ethUsd : null;

  return (
    <>
      <section className="card p-5">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-zinc-500">Volume ({data?.quoteSymbol ?? "ETH"})</div>
            <div className="font-mono text-lg font-bold text-zinc-900">
              {data ? fmtNum(data.volume) : "-"}
            </div>
            {volumeUsd !== null && <div className="font-mono text-[11px] text-zinc-500">{fmtUsd(volumeUsd)}</div>}
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-zinc-500">Trades</div>
            <div className="font-mono text-lg font-bold text-zinc-900">{data ? data.tradeCount.toLocaleString() : "-"}</div>
          </div>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="text-sm font-medium text-zinc-700">Trades</h2>
        {loading && <p className="mt-3 text-xs text-zinc-500">Reading on-chain trades…</p>}
        {!loading && data && data.trades.length === 0 && (
          <p className="mt-3 text-xs text-zinc-500">No trades yet. Be the first to trade this token.</p>
        )}
        {!loading && data && data.trades.length > 0 && (
          <div className="thin-scroll mt-3 max-h-80 overflow-y-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-widest text-zinc-500">
                  <th className="pb-2 font-medium">Account</th>
                  <th className="pb-2 font-medium">Type</th>
                  <th className="pb-2 text-right font-medium">{data.quoteSymbol}</th>
                  <th className="pb-2 text-right font-medium">Tokens</th>
                  <th className="pb-2 text-right font-medium">When</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {data.trades.map((t, i) => (
                  <tr key={`${t.txHash}-${i}`} className="border-t border-ink-line">
                    <td className="py-2">
                      <a href={explorerTx(t.txHash)} target="_blank" rel="noreferrer" className="hover:underline">
                        {short(t.account)}
                      </a>
                    </td>
                    <td className={`py-2 font-bold ${t.type === "buy" ? "text-green-600" : "text-red-500"}`}>
                      {t.type === "buy" ? "Buy" : "Sell"}
                    </td>
                    <td className="py-2 text-right">{fmtNum(t.quote)}</td>
                    <td className="py-2 text-right">{fmtNum(t.tokens)}</td>
                    <td className="py-2 text-right text-zinc-500">{ago(t.ts)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function short(a: string): string {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "-";
}

function fmtNum(x: number): string {
  if (!isFinite(x)) return "-";
  if (x === 0) return "0";
  if (x >= 1000) return x.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (x >= 1) return x.toLocaleString(undefined, { maximumFractionDigits: 4 });
  return x.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
}

function fmtUsd(x: number): string {
  if (x >= 1000) return `$${(x / 1000).toFixed(1)}K`;
  return `$${x.toFixed(2)}`;
}

function ago(ts: number | null): string {
  if (!ts) return "-";
  const s = Math.max(0, Math.floor(Date.now() / 1000 - ts));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
