"use client";

import { useEffect, useState } from "react";
import { explorerUrl } from "@/lib/chain";

interface Holder {
  address: string;
  share: number;
}

/**
 * Top token holders and each one's share of supply (from Blockscout). The
 * creator address is tagged. Hidden entirely when the explorer returns nothing,
 * so the page never shows an empty shell.
 */
export function TopHolders({ token, creator }: { token: string; creator?: string }) {
  const [holders, setHolders] = useState<Holder[] | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/token/holders?address=${token}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (alive) setHolders(Array.isArray(d?.holders) ? d.holders : []);
      })
      .catch(() => {
        if (alive) setHolders([]);
      });
    return () => {
      alive = false;
    };
  }, [token]);

  if (holders !== null && holders.length === 0) return null;

  return (
    <section className="card p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-zinc-700">Top holders</h2>
        <span className="text-[10px] uppercase tracking-widest text-zinc-500">share of supply</span>
      </div>
      {holders === null ? (
        <p className="mt-3 text-xs text-zinc-500">Loading holders…</p>
      ) : (
        <ol className="mt-3 space-y-1.5 font-mono text-xs">
          {holders.map((h, i) => {
            const isCreator = creator && h.address.toLowerCase() === creator.toLowerCase();
            return (
              <li key={h.address} className="flex items-center gap-2">
                <span className="w-6 shrink-0 text-right text-zinc-500">{i + 1}.</span>
                <a
                  href={`${explorerUrl}/address/${h.address}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-zinc-800 hover:underline"
                >
                  {h.address.slice(0, 6)}…{h.address.slice(-4)}
                </a>
                {isCreator && (
                  <span className="rounded-full bg-black/[0.06] px-2 py-0.5 text-[10px] text-zinc-600">creator</span>
                )}
                <span className="ml-auto text-zinc-800">{(h.share * 100).toFixed(2)}%</span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
