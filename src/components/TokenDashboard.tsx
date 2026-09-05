"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount, useSignMessage, useWriteContract } from "wagmi";
import { formatEther, zeroAddress, type Address } from "viem";
import { CurveTradeWidget } from "./CurveTradeWidget";
import { V3TradeWidget } from "./V3TradeWidget";
import { V1CreatorFees } from "./V1CreatorFees";
import { PriceChart } from "./PriceChart";
import { PriceChartV2 } from "./PriceChartV2";
import { ClaimFees } from "./ClaimFees";
import { VerifiedBadge } from "./VerifiedBadge";
import { PairedWithChip } from "./PairedWithChip";
import { TokenActivity } from "./TokenActivity";
import { TopHolders } from "./TopHolders";
import { TokenDetails } from "./TokenDetails";
import { isVerified } from "@/lib/verified";
import { v2FactoryAbi } from "@/lib/pons/abisV2";
import { PONS_V2 } from "@/lib/pons";
import { explorerToken, explorerTx, explorerUrl } from "@/lib/chain";

interface V2Status {
  token: Address;
  name: string;
  symbol: string;
  decimals: number;
  logo: string;
  description: string;
  deployer: Address;
  creatorFeeRecipient: Address;
  curveAddress: Address;
  pairToken: Address;
  phase: number;
  phaseLabel: string;
  curve: {
    quoteReserve: string;
    tokenReserve: string;
    realQuoteReserve: string;
    graduationThreshold: string;
    sellableTokens: string;
    readyToGraduate: boolean;
    graduated: boolean;
    spotPrice: number;
    progress: number;
    feeBps: string;
    creatorTaxBps: string;
  } | null;
}

interface V1Status {
  token: Address;
  name: string;
  symbol: string;
  decimals: number;
  logo: string;
  description: string;
  pool: Address;
  poolFee: number;
  isToken0: boolean;
  deployer: Address;
  graduation: { graduated: boolean; progress: number };
  price: {
    inWeth: number | null;
    usd: number | null;
    marketCapWeth: number | null;
    marketCapUsd: number | null;
    ethUsd: number | null;
  };
  fees: { creatorSharePercent: number; protocolSharePercent: number; feeRedirect: Address; locker: Address };
}

export function TokenDashboard({ address }: { address: string }) {
  const [version, setVersion] = useState<"v1" | "v2" | null>(null);
  const [v2, setV2] = useState<V2Status | null>(null);
  const [v1, setV1] = useState<V1Status | null>(null);
  const [recordLogo, setRecordLogo] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { address: account } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [removeState, setRemoveState] = useState<"idle" | "busy" | "done">("idle");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    // CREO's own launch record (KV) - used as an image fallback when the
    // on-chain logo is empty (common for v2), so the token page never shows a
    // blank logo for something launched through CREO.
    fetch(`/api/launches?token=${address}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setRecordLogo(d?.item?.logo ?? ""))
      .catch(() => {});
    try {
      const r2 = await fetch(`/api/v2/token?address=${address}`, { cache: "no-store" });
      if (r2.ok) {
        const d = await r2.json();
        if (!d.error) {
          setVersion("v2");
          setV2(d);
          return;
        }
      }
      const r1 = await fetch(`/api/token?address=${address}`, { cache: "no-store" });
      if (r1.ok) {
        const d = await r1.json();
        if (!d.error) {
          setVersion("v1");
          setV1(d);
          return;
        }
      }
      setError("Couldn't load this token. It may not be a CREO launch, or the chain is unreachable.");
    } catch {
      setError("Couldn't reach the chain right now.");
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    load();
  }, [load]);

  const header = v2 ?? v1;
  const isCreator = !!account && !!header && account.toLowerCase() === header.deployer.toLowerCase();

  // Remove this launch from CREO's feed (creator-signed; on-chain token stays).
  async function removeFromFeed() {
    if (!account || !header) return;
    setRemoveState("busy");
    try {
      const signature = await signMessageAsync({
        message: `Remove ${header.token.toLowerCase()} from the CREO feed`,
      });
      const res = await fetch("/api/launches", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: header.token, address: account, signature }),
      });
      setRemoveState(res.ok ? "done" : "idle");
    } catch {
      setRemoveState("idle");
    }
  }

  return (
    <>
      <div className="mx-auto max-w-2xl px-4 py-8">
        {loading && <p className="mt-10 text-sm text-zinc-500">Reading on-chain state…</p>}
        {error && !header && (
          <div className="mt-10 card p-5">
            <p className="text-sm text-zinc-500">{error}</p>
            <button className="btn-ghost mt-3" onClick={load}>Retry</button>
          </div>
        )}

        {header && (
          <section className="mt-8 card p-5">
            <div className="flex items-center gap-4">
              <TokenLogo src={header.logo || recordLogo} symbol={header.symbol} />
              <div className="min-w-0 flex-1">
                <h1 className="flex items-center gap-1.5 text-xl font-black uppercase tracking-tight">
                  <span className="truncate">{header.name}</span>
                  {isVerified(header.token) && <VerifiedBadge />}
                  <span className="font-mono text-zinc-600">${header.symbol}</span>
                </h1>
                <div className="mt-0.5 flex items-center gap-2">
                  <a className="truncate font-mono text-xs text-zinc-500 hover:underline" href={explorerToken(header.token)} target="_blank" rel="noreferrer">
                    {header.token.slice(0, 10)}…{header.token.slice(-8)}
                  </a>
                  <CopyButton value={header.token} />
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <span className="chip uppercase">{version}</span>
                <PairedWithChip pairToken={v2 ? v2.pairToken : undefined} />
              </div>
            </div>
            {header.description && <p className="mt-3 text-sm text-zinc-600">{header.description}</p>}
            {isCreator && (
              <div className="mt-3 flex items-center gap-3 border-t border-zinc-300 pt-3">
                {removeState === "done" ? (
                  <span className="text-xs text-zinc-500">Removed from the feed.</span>
                ) : (
                  <>
                    <button
                      className="rounded-lg border border-ink-line px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-700 hover:bg-zinc-900 hover:text-white disabled:opacity-40"
                      disabled={removeState === "busy"}
                      onClick={removeFromFeed}
                    >
                      {removeState === "busy" ? "Removing…" : "Remove from feed"}
                    </button>
                    <span className="text-[10px] text-zinc-500">Only you (creator) see this. The token stays on-chain.</span>
                  </>
                )}
              </div>
            )}
          </section>
        )}

        {/* v2 */}
        {version === "v2" && v2 && (
          <div className="mt-4 space-y-4">
            <PriceChartV2 token={v2.token} />
            <TokenActivity token={v2.token} />
            {v2.phase === 0 && v2.curve && (
              <>
                <section className="card p-5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-zinc-700">Graduation progress</span>
                    <span className="font-mono">{(v2.curve.progress * 100).toFixed(1)}%</span>
                  </div>
                  <div className="mt-2 h-2 w-full bg-black/10">
                    <div className="h-full bg-pink" style={{ width: `${Math.min(v2.curve.progress * 100, 100)}%` }} />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                    <Stat label="Raised" value={`${Number(formatEther(BigInt(v2.curve.realQuoteReserve))).toFixed(4)} ETH`} />
                    <Stat label="Threshold" value={`${Number(formatEther(BigInt(v2.curve.graduationThreshold))).toFixed(4)} ETH`} />
                    <Stat label="Trade fee" value={`${Number(v2.curve.feeBps) / 100}%`} />
                    <Stat label="Creator tax" value={`${Number(v2.curve.creatorTaxBps) / 100}%`} />
                  </div>
                </section>
                <CurveTradeWidget
                  curveAddress={v2.curveAddress}
                  token={v2.token}
                  symbol={v2.symbol}
                  decimals={v2.decimals}
                  pairToken={v2.pairToken}
                  curve={v2.curve}
                />
              </>
            )}
            {v2.phase === 1 && <GraduatePush token={v2.token} onDone={load} />}
            {v2.phase === 2 && (
              <section className="card p-5">
                <h2 className="text-sm font-medium text-zinc-700">🎓 Graduated</h2>
                <p className="mt-1 text-xs text-zinc-500">
                  This launch filled its bonding curve and now trades as a permanently locked
                  Uniswap V4 pool. The chart above shows its bonding-curve history; live V4 trading
                  runs on Pons.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <a className="btn-brand" href={explorerToken(v2.token)} target="_blank" rel="noreferrer">
                    View token on explorer →
                  </a>
                  <a className="btn-ghost" href="https://ponsfamily.com" target="_blank" rel="noreferrer">
                    Trade on Pons (V4)
                  </a>
                </div>
              </section>
            )}
            <ClaimFees
              pairToken={v2.pairToken}
              creator={v2.creatorFeeRecipient && v2.creatorFeeRecipient !== zeroAddress ? v2.creatorFeeRecipient : v2.deployer}
            />
            <TopHolders token={v2.token} creator={v2.deployer} />
            <TokenDetails
              token={v2.token}
              creator={v2.deployer}
              pairToken={v2.pairToken}
              pool={v2.curveAddress}
              poolLabel="Bonding curve"
              decimals={v2.decimals}
            />
          </div>
        )}

        {/* v1 */}
        {version === "v1" && v1 && (
          <div className="mt-4 space-y-4">
            <PriceChart pool={v1.pool} isToken0={v1.isToken0} />
            <section className="card p-5">
              <h2 className="text-sm font-medium text-zinc-700">Market</h2>
              <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                <Stat
                  label="Price"
                  value={fmtUsd(v1.price.usd) ?? (v1.price.inWeth !== null ? `${fmtSmall(v1.price.inWeth)} WETH` : "-")}
                />
                <Stat
                  label="Market cap"
                  value={fmtUsd(v1.price.marketCapUsd) ?? (v1.price.marketCapWeth !== null ? `${fmtSmall(v1.price.marketCapWeth)} WETH` : "-")}
                />
                <Stat label="Status" value={v1.graduation.graduated ? "Graduated" : "Live"} />
                <Stat label="Creator share" value={`${v1.fees.creatorSharePercent}%`} />
              </div>
            </section>

            <V3TradeWidget
              token={v1.token}
              symbol={v1.symbol}
              decimals={v1.decimals}
              poolFee={v1.poolFee}
              priceInWeth={v1.price.inWeth}
            />

            <V1CreatorFees
              locker={v1.fees.locker}
              token={v1.token}
              symbol={v1.symbol}
              decimals={v1.decimals}
              isToken0={v1.isToken0}
              deployer={v1.deployer}
              feeRedirect={v1.fees.feeRedirect}
              creatorSharePercent={v1.fees.creatorSharePercent}
              protocolSharePercent={v1.fees.protocolSharePercent}
              tokenPriceUsd={v1.price.usd}
              ethUsd={v1.price.ethUsd}
            />

            <TopHolders token={v1.token} creator={v1.deployer} />
            <TokenDetails
              token={v1.token}
              creator={v1.deployer}
              pool={v1.pool}
              poolLabel="Uniswap pool"
              decimals={v1.decimals}
            />

            <a className="btn-ghost w-full" href={`${explorerUrl}/address/${v1.pool}`} target="_blank" rel="noreferrer">
              View the pool on explorer →
            </a>
          </div>
        )}
      </div>
    </>
  );
}

function GraduatePush({ token, onDone }: { token: Address; onDone: () => void }) {
  const { isConnected } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const [busy, setBusy] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function push() {
    setError(null);
    setBusy(true);
    try {
      const hash = await writeContractAsync({
        address: PONS_V2.factory,
        abi: v2FactoryAbi,
        functionName: "createGraduatedPool",
        args: [token],
      });
      setTxHash(hash);
      setTimeout(onDone, 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message.split("\n")[0] : "Failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card p-5">
      <h2 className="text-sm font-medium text-zinc-700">Finish graduation</h2>
      <p className="mt-1 text-xs text-zinc-500">
        The curve is drained but the pool isn’t created yet. This is permissionless - anyone can seed it.
      </p>
      <button className="btn-brand mt-3 w-full" disabled={!isConnected || busy} onClick={push}>
        {busy ? "Confirm in wallet…" : "Create graduated pool"}
      </button>
      {txHash && (
        <a className="mt-2 block text-xs text-pink" href={explorerTx(txHash)} target="_blank" rel="noreferrer">
          ✓ Sent - view on explorer
        </a>
      )}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </section>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="shrink-0 rounded-md border border-ink-line px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-700 hover:bg-zinc-900 hover:text-white"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        } catch {
          /* ignore */
        }
      }}
    >
      {copied ? "Copied" : "Copy CA"}
    </button>
  );
}

/** Format a USD amount, keeping tiny values readable (no scientific notation). */
function fmtUsd(x: number | null): string | null {
  if (x === null || !isFinite(x)) return null;
  if (x === 0) return "$0";
  if (x >= 1) return `$${x.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  const s = x.toFixed(12).replace(/0+$/, "").replace(/\.$/, "");
  return `$${s}`;
}

function fmtSmall(x: number): string {
  if (x >= 1) return x.toLocaleString(undefined, { maximumFractionDigits: 4 });
  return x.toFixed(12).replace(/0+$/, "").replace(/\.$/, "");
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-ink-line bg-white/60 p-2">
      <div className="text-[10px] uppercase tracking-widest text-zinc-500">{label}</div>
      <div className="font-mono text-zinc-800">{value}</div>
    </div>
  );
}

function TokenLogo({ src, symbol }: { src: string; symbol: string }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) {
    return (
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-pink to-rose text-lg font-black text-white">
        {symbol.slice(0, 3).toUpperCase()}
      </span>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={symbol} className="h-16 w-16 rounded-2xl object-cover" onError={() => setBroken(true)} />;
}
