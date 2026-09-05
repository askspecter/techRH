"use client";

import { useEffect, useRef, useState } from "react";
import { AssetLogo } from "./AssetLogo";

export interface QuoteAsset {
  asset: string;
  symbol: string;
  name: string;
}

/**
 * "Paired asset" picker — dark glass dropdown showing ticker + full name.
 * A square badge stands in for a token logo (we don't host per-asset art).
 */
export function QuoteAssetSelect({
  assets,
  value,
  onChange,
}: {
  assets: QuoteAsset[];
  value: string;
  onChange: (asset: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = assets.find((a) => a.asset.toLowerCase() === value.toLowerCase()) ?? assets[0];

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 rounded-xl border border-ink-line bg-white/70 px-3 py-2.5 text-left transition hover:border-black/15"
      >
        {selected && <AssetLogo symbol={selected.symbol} size={24} />}
        <span className="font-bold text-zinc-900">{selected?.symbol}</span>
        <span className="truncate text-xs text-zinc-500">{selected?.name}</span>
        <span className="ml-auto text-xs text-zinc-500">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="thin-scroll absolute z-30 mt-2 max-h-64 w-full overflow-y-auto rounded-xl border border-ink-line bg-white p-1 shadow-card">
          {assets.map((a) => {
            const active = a.asset.toLowerCase() === value.toLowerCase();
            return (
              <button
                type="button"
                key={a.asset}
                onClick={() => {
                  onChange(a.asset);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition ${
                  active ? "bg-pink/10 text-zinc-900" : "text-zinc-800 hover:bg-black/[0.04]"
                }`}
              >
                <AssetLogo symbol={a.symbol} size={26} />
                <span className="font-bold">{a.symbol}</span>
                <span className="ml-auto truncate text-xs text-zinc-500">{a.name}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
