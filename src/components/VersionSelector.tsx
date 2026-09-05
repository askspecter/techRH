"use client";

import type { PonsVersion, VersionInfo } from "@/lib/pons";

export function VersionSelector({
  versions,
  selected,
  recommended,
  onSelect,
}: {
  versions: VersionInfo[];
  selected: PonsVersion;
  recommended?: PonsVersion;
  onSelect: (v: PonsVersion) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {versions.map((info) => {
        const isActive = selected === info.version;
        const isRecommended = recommended === info.version;
        return (
          <button
            key={info.version}
            onClick={() => onSelect(info.version)}
            className={`card card-hover p-4 text-left ${
              isActive ? "!border-rose/60 shadow-glow" : ""
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-display text-base font-bold text-zinc-900">{info.label}</span>
              <span className="flex gap-1.5">
                {isRecommended && <span className="chip chip-accent">AI pick</span>}
                {!info.ready && <span className="chip text-ember">deploy off</span>}
              </span>
            </div>
            <p className="mt-2 text-sm text-zinc-700">{info.liquidity}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {info.quoteAssets.slice(0, 5).map((q) => (
                <span key={q} className="chip">{q}</span>
              ))}
            </div>
          </button>
        );
      })}
    </div>
  );
}
