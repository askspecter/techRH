"use client";

import { useEffect, useState } from "react";
import { explorerToken, explorerUrl } from "@/lib/chain";
import { pairAssetSymbol } from "@/lib/pons/registry";

interface Supply {
  totalSupply: number | null;
  burned: number | null;
  circulating: number | null;
}

/**
 * Static, at-a-glance facts about a token: contract, verification, pool,
 * creator, paired asset, and supply/burned (read live from chain). Mirrors the
 * par-style "Details" card.
 */
export function TokenDetails({
  token,
  creator,
  pairToken,
  pool,
  poolLabel = "Uniswap pool",
  decimals = 18,
}: {
  token: string;
  creator?: string;
  pairToken?: string | null;
  pool?: string | null;
  poolLabel?: string;
  decimals?: number;
}) {
  const [supply, setSupply] = useState<Supply | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/token/supply?address=${token}&decimals=${decimals}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (alive) setSupply(d);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [token, decimals]);

  return (
    <section className="card p-5">
      <h2 className="text-sm font-medium text-zinc-700">Details</h2>
      <dl className="mt-3 space-y-2 text-xs">
        <Row label="Contract">
          <Link href={explorerToken(token)}>{short(token)}</Link>
        </Row>
        <Row label="Source">
          <Link href={explorerToken(token)}>Verified on Blockscout</Link>
        </Row>
        {pool && (
          <Row label={poolLabel}>
            <Link href={`${explorerUrl}/address/${pool}`}>{short(pool)}</Link>
          </Row>
        )}
        {creator && (
          <Row label="Creator">
            <Link href={`${explorerUrl}/address/${creator}`}>{short(creator)}</Link>
          </Row>
        )}
        <Row label="Paired asset">{pairAssetSymbol(pairToken)}</Row>
        <Row label="Supply">{supply?.circulating != null ? fmtNum(supply.circulating) : "-"}</Row>
        <Row label="Burned">{supply?.burned != null ? fmtNum(supply.burned) : "-"}</Row>
      </dl>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="truncate font-mono text-zinc-800">{children}</dd>
    </div>
  );
}

function Link({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="text-pink hover:underline">
      {children}
    </a>
  );
}

function short(a: string): string {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "-";
}

function fmtNum(x: number): string {
  if (!isFinite(x)) return "-";
  return Math.round(x).toLocaleString();
}
