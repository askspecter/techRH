"use client";

import { useState } from "react";

/**
 * Real asset logo for a ticker (stocks + a few crypto), with a graceful
 * fallback to a monogram badge if the image can't load. Stock marks come from
 * a public logo CDN; crypto from a coin icon CDN. No API key required.
 */
// Crypto marks are served locally from /public so they always render (no
// dependency on a third-party icon CDN that can disappear).
const CRYPTO: Record<string, string> = {
  ETH: "/eth.svg",
  USDG: "/usdg.png", // Global Dollar - official green mark
  USDC: "/usdc.svg",
};

function logoUrl(symbol: string): string {
  const s = symbol.toUpperCase();
  if (CRYPTO[s]) return CRYPTO[s];
  // Parqet serves clean stock/ETF marks by ticker.
  return `https://assets.parqet.com/logos/symbol/${s}?format=png&size=64`;
}

export function AssetLogo({ symbol, size = 20 }: { symbol: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const s = (symbol || "").toUpperCase();

  if (!s || failed) {
    return (
      <span
        className="flex shrink-0 items-center justify-center rounded-full bg-black/[0.06] text-[9px] font-black text-zinc-700"
        style={{ width: size, height: size }}
      >
        {s.slice(0, 2)}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={logoUrl(s)}
      alt={s}
      width={size}
      height={size}
      loading="lazy"
      onError={() => setFailed(true)}
      className="shrink-0 rounded-full bg-white object-contain"
      style={{ width: size, height: size }}
    />
  );
}
