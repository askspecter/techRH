"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccount, useBalance } from "wagmi";
import { formatEther, zeroAddress } from "viem";
import { VersionSelector } from "./VersionSelector";
import { QuoteAssetSelect } from "./QuoteAssetSelect";
import { DeployButton } from "./DeployButton";
import { allVersionInfo, type LaunchInput, type PonsVersion, type QuoteAsset } from "@/lib/pons";
import type { LaunchPackage } from "@/lib/ai/schema";
import { uploadLogo } from "@/lib/upload";
import { robinhoodChain } from "@/lib/chain";

interface GenerateResponse {
  package: LaunchPackage;
  logo: string;
  availability: {
    ticker: string;
    taken: boolean;
    matches: Array<{ name: string; symbol: string; address: string }>;
    note: string;
  };
}

interface V2Options {
  launchFee: string;
  canLaunch: boolean | null;
  configs: Array<{
    id: string;
    supply: string;
    curveFeeBps: string;
    graduationThreshold: string;
    poolFee: number;
    tickSpacing: number;
  }>;
  quoteAssets: Array<{ asset: string; symbol: string; name: string; decimals: number; graduationThreshold: string }>;
}

export function LaunchStudio() {
  const versions = useMemo(() => allVersionInfo(), []);
  const { address, isConnected } = useAccount();
  // Read the wallet's native balance on Robinhood Chain explicitly, so the
  // deploy step shows the real balance regardless of the wallet's active chain.
  const { data: balance } = useBalance({
    address,
    chainId: robinhoodChain.id,
    query: { enabled: Boolean(address) && isConnected },
  });

  const [idea, setIdea] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateResponse | null>(null);

  // Deploy-bound fields (AI-seeded, user-editable).
  const [name, setName] = useState("");
  const [ticker, setTicker] = useState("");
  const [description, setDescription] = useState("");
  const [version, setVersion] = useState<PonsVersion>("v2");
  const [quoteAsset, setQuoteAsset] = useState<QuoteAsset>("ETH");
  const [logo, setLogo] = useState("");
  const [twitter, setTwitter] = useState("");
  const [telegram, setTelegram] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // AI image generation (icon vs photo), on demand.
  const [imageStyle, setImageStyle] = useState<"icon" | "photo">("icon");
  const [imageBusy, setImageBusy] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  async function regenImage(style: "icon" | "photo") {
    setImageStyle(style);
    setImageError(null);
    setImageBusy(true);
    try {
      const res = await fetch("/api/image", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ticker,
          description: description || result?.package.lore || "",
          style,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Image generation failed.");
      if (data.image) setLogo(data.image);
    } catch (err) {
      setImageError(err instanceof Error ? err.message : "Image generation failed.");
    } finally {
      setImageBusy(false);
    }
  }

  // v2-specific, loaded live from chain.
  const [v2opts, setV2opts] = useState<V2Options | null>(null);
  const [v2loading, setV2loading] = useState(false);
  const [launchConfigId, setLaunchConfigId] = useState(0);
  const [pairToken, setPairToken] = useState<`0x${string}`>(zeroAddress);
  const [buybackEnabled, setBuybackEnabled] = useState(true);
  const [initialBuyEth, setInitialBuyEth] = useState("");

  async function handleLogoUpload(file: File | undefined) {
    if (!file) return;
    setUploadError(null);
    setUploading(true);
    try {
      setLogo(await uploadLogo(file));
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  function spin() {
    if (loading) return;
    const pick = ROULETTE_IDEAS[Math.floor(Math.random() * ROULETTE_IDEAS.length)];
    setIdea(pick);
    void generate(pick);
  }

  async function generate(ideaOverride?: string) {
    const useIdea = (ideaOverride ?? idea).trim();
    if (useIdea.length < 3) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idea: useIdea }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Generation failed.");
      const r = data as GenerateResponse;
      setResult(r);
      setName(r.package.name);
      setTicker(r.package.ticker);
      setDescription(r.package.description);
      setVersion(r.package.recommendation.version);
      setQuoteAsset(r.package.recommendation.quoteAsset);
      setLogo(r.logo);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (version !== "v2" || !result) return;
    let cancelled = false;
    setV2loading(true);
    const q = address ? `?address=${address}` : "";
    fetch(`/api/v2/launch-options${q}`)
      .then((r) => r.json())
      .then((data: V2Options & { error?: string }) => {
        if (cancelled || data.error) return;
        setV2opts(data);
        if (data.configs[0]) setLaunchConfigId(Number(data.configs[0].id));
      })
      .catch(() => {})
      .finally(() => !cancelled && setV2loading(false));
    return () => {
      cancelled = true;
    };
  }, [version, result, address]);

  function pickVersion(v: PonsVersion) {
    setVersion(v);
    if (v === "v1") setPairToken(zeroAddress);
  }

  const launchInput: LaunchInput = {
    version,
    name,
    ticker,
    description,
    imageUri: logo,
    quoteAsset,
    pairToken,
    launchConfigId,
    buybackEnabled,
    initialBuyEth: initialBuyEth && Number(initialBuyEth) > 0 ? initialBuyEth : undefined,
    twitter,
    telegram,
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-10">
      <div className="animate-fade-up">
        <p className="eyebrow">The studio</p>
        <h1 className="mt-2 font-display text-3xl font-bold text-zinc-900 sm:text-4xl">
          Type it. <span className="grad-text">Launch it.</span>
        </h1>
        <p className="mt-2 max-w-xl text-sm text-zinc-600">
          One sentence becomes a full launch package. Edit anything, pick the model, and deploy to
          Pons, all signed by your own wallet.
        </p>
      </div>

      {/* Step 1 — idea */}
      <Step n="01" title="Describe your idea" className="animate-fade-up">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && idea.trim().length >= 3 && generate()}
            placeholder="e.g. a cat coin that day-trades NVDA from the couch"
            className="field"
          />
          <button className="btn-ghost shrink-0" disabled={loading} onClick={spin} title="Random idea, instant generate">
            🎲 Roulette
          </button>
          <button className="btn-brand shrink-0" disabled={loading || idea.trim().length < 3} onClick={() => generate()}>
            {loading ? "Rolling…" : "Generate"}
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </Step>

      {loading && !result && <CookingReel />}

      {result && (
        <>
          {/* Step 2 — package */}
          <Step n="02" title="Your AI launch package" className="animate-fade-up">
            <div className="flex items-start gap-4">
              <div className="flex flex-col items-center gap-2">
                <div className="relative h-24 w-24">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={logo}
                    alt="token art"
                    className="h-24 w-24 rounded-2xl border border-ink-line object-cover shadow-glow"
                  />
                  {imageBusy && (
                    <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/60 backdrop-blur-sm">
                      <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    </div>
                  )}
                </div>

                {/* Icon / Photo segmented control */}
                <div className="flex rounded-lg border border-ink-line p-0.5 text-[10px]">
                  {(["icon", "photo"] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => regenImage(s)}
                      disabled={imageBusy}
                      className={`rounded-md px-2 py-1 font-semibold capitalize transition ${
                        imageStyle === s ? "bg-pink text-white" : "text-zinc-600 hover:text-zinc-900"
                      }`}
                      title={s === "photo" ? "Generate a photorealistic image" : "Generate an icon logo"}
                    >
                      {s}
                    </button>
                  ))}
                </div>

                <div className="flex gap-1.5">
                  <button
                    onClick={() => regenImage(imageStyle)}
                    disabled={imageBusy}
                    className="btn-ghost !px-2 !py-1 text-[10px]"
                    title="Generate a new AI image"
                  >
                    {imageBusy ? "Generating…" : "✦ Regenerate"}
                  </button>
                  <label className="btn-ghost cursor-pointer !px-2 !py-1 text-[10px]">
                    {uploading ? "Uploading…" : "Upload"}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={uploading}
                      onChange={(e) => handleLogoUpload(e.target.files?.[0])}
                    />
                  </label>
                </div>
              </div>

              <div className="grid flex-1 grid-cols-2 gap-2">
                <Field label="Name" value={name} onChange={setName} />
                <Field
                  label="Ticker"
                  value={ticker}
                  onChange={(v) => setTicker(v.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                  mono
                />
              </div>
            </div>
            {imageError && <p className="mt-1 text-xs text-red-600">{imageError}</p>}
            {uploadError && <p className="mt-1 text-xs text-red-600">{uploadError}</p>}

            <div className="mt-3">
              <Field label="Description" value={description} onChange={setDescription} textarea />
            </div>

            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Field label="X / Twitter" value={twitter} onChange={setTwitter} placeholder="@handle or URL" />
              <Field label="Telegram" value={telegram} onChange={setTelegram} placeholder="t.me/…" />
            </div>

            {result.availability.taken && (
              <p className="mt-2 rounded-lg border border-ember/30 bg-ember/[0.06] px-3 py-2 text-xs text-ember-soft">
                ⚠ A token with the symbol ${ticker} already exists on this chain (
                {result.availability.matches.length}). Symbols need not be unique, but a distinctive
                one stands out.
              </p>
            )}

            <Reveal title="Lore / narrative">{result.package.lore}</Reveal>
            <Reveal title={`X thread · ${result.package.xThread.length} posts`}>
              <ol className="list-decimal space-y-2 pl-5">
                {result.package.xThread.map((t, i) => (
                  <li key={i} className="text-zinc-700">{t}</li>
                ))}
              </ol>
            </Reveal>
            <Reveal title={`Meme prompts · ${result.package.memePrompts.length}`}>
              <ul className="list-disc space-y-1 pl-5">
                {result.package.memePrompts.map((m, i) => (
                  <li key={i} className="text-zinc-600">{m}</li>
                ))}
              </ul>
            </Reveal>
          </Step>

          {/* Step 3 — model */}
          <Step n="03" title="Choose a launch model" className="animate-fade-up">
            <VersionSelector
              versions={versions}
              selected={version}
              recommended={result.package.recommendation.version}
              onSelect={pickVersion}
            />

            {version === "v2" && (
              <div className="mt-4 space-y-4 rounded-xl border border-ink-line bg-white/60 p-4">
                {v2loading && !v2opts && (
                  <p className="text-xs text-zinc-500">Loading options from the factory…</p>
                )}

                {v2opts && (
                  <>
                    {Number(v2opts.launchFee) > 0 && (
                      <p className="text-xs text-zinc-600">
                        Launch fee:{" "}
                        <span className="font-mono text-zinc-900">{formatEther(BigInt(v2opts.launchFee))} ETH</span>
                      </p>
                    )}

                    {v2opts.configs.length > 0 && (
                      <div>
                        <label className="text-sm text-zinc-700">Launch config</label>
                        <div className="mt-2 space-y-1.5">
                          {v2opts.configs.map((c) => (
                            <label key={c.id} className="flex cursor-pointer items-center gap-2 text-xs text-zinc-600">
                              <input
                                type="radio"
                                name="cfg"
                                className="accent-rose"
                                checked={launchConfigId === Number(c.id)}
                                onChange={() => setLaunchConfigId(Number(c.id))}
                              />
                              #{c.id} · supply {formatCompact(c.supply)} · graduates ~
                              {formatEther(BigInt(c.graduationThreshold))} · pool fee {c.poolFee}
                            </label>
                          ))}
                        </div>
                      </div>
                    )}

                    <div>
                      <label className="text-sm text-zinc-700">Paired asset</label>
                      <div className="mt-2">
                        <QuoteAssetSelect
                          assets={v2opts.quoteAssets}
                          value={pairToken}
                          onChange={(a) => setPairToken(a as `0x${string}`)}
                        />
                      </div>
                    </div>

                    <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700">
                      <input
                        type="checkbox"
                        className="accent-rose"
                        checked={buybackEnabled}
                        onChange={(e) => setBuybackEnabled(e.target.checked)}
                      />
                      Enable buyback (protocol buys back &amp; locks supply)
                    </label>
                  </>
                )}
              </div>
            )}
          </Step>

          {/* Step 4 — deploy */}
          <Step n="04" title="Deploy to Pons" className="animate-fade-up">
            {isConnected && (
              <div className="mb-3 flex items-center justify-between rounded-xl border border-ink-line bg-white/60 px-3 py-2 text-xs">
                <span className="text-zinc-500">Wallet balance</span>
                <span className="font-mono text-zinc-900">
                  {balance ? `${Number(balance.formatted).toFixed(4)} ${balance.symbol}` : "…"}
                </span>
              </div>
            )}

            <label className="mb-3 block text-sm text-zinc-700">
              Dev buy (optional)
              <div className="mt-1 flex items-center gap-2">
                <input
                  value={initialBuyEth}
                  onChange={(e) => setInitialBuyEth(e.target.value.replace(/[^0-9.]/g, ""))}
                  placeholder="0.0"
                  inputMode="decimal"
                  className="w-32 rounded-xl border border-ink-line bg-white/70 px-3 py-2 font-mono text-sm outline-none focus:border-rose/60"
                />
                <span className="text-xs text-zinc-500">ETH — buy your own token at launch</span>
              </div>
            </label>

            <DeployButton input={launchInput} disabled={!name || ticker.length < 2} />
            <a href="/feed" className="mt-3 block text-xs text-zinc-500 transition hover:text-rose">
              After deploying, find it in the live feed →
            </a>
          </Step>
        </>
      )}
    </div>
  );
}

/* ── layout helpers ─────────────────────────────────────────────────────── */

function Step({
  n,
  title,
  children,
  className = "",
}: {
  n: string;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`card p-5 ${className}`}>
      <div className="mb-4 flex items-center gap-3">
        <span className="step-badge">{n}</span>
        <h2 className="font-display text-lg font-bold text-zinc-900">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  mono,
  textarea,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  mono?: boolean;
  textarea?: boolean;
  placeholder?: string;
}) {
  const cls = `mt-1 w-full rounded-xl border border-ink-line bg-white/70 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-rose/60 ${
    mono ? "font-mono" : ""
  }`;
  return (
    <label className="block text-xs text-zinc-500">
      {label}
      {textarea ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={2} className={cls} placeholder={placeholder} />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)} className={cls} placeholder={placeholder} />
      )}
    </label>
  );
}

function Reveal({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="mt-3 rounded-xl border border-ink-line bg-white/60 p-3">
      <summary className="cursor-pointer select-none text-sm text-zinc-700 transition hover:text-zinc-900">
        {title}
      </summary>
      <div className="mt-2 whitespace-pre-wrap text-sm text-zinc-700">{children}</div>
    </details>
  );
}

/** Cinematic "cooking" reel — a scanning frame + staged captions. */
function CookingReel() {
  const [pct, setPct] = useState(8);
  useEffect(() => {
    const id = setInterval(() => {
      setPct((p) => (p >= 94 ? 94 : Math.min(94, p + 4 + Math.floor(Math.random() * 7))));
    }, 460);
    return () => clearInterval(id);
  }, []);
  const label = COOK_STEPS[Math.min(COOK_STEPS.length - 1, Math.floor((pct / 100) * COOK_STEPS.length))];

  return (
    <section className="card overflow-hidden p-5">
      <div className="mb-4 flex items-center gap-3">
        <span className="step-badge animate-glow-pulse">✦</span>
        <h2 className="font-display text-lg font-bold text-zinc-900">Rolling the reel…</h2>
      </div>

      <div className="relative h-2 w-full overflow-hidden rounded-full bg-black/[0.05]">
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${pct}%`, background: "linear-gradient(90deg,#f2b134,#e0532a)" }}
        />
      </div>
      <div className="mt-3 flex items-center justify-between">
        <p className="animate-pulse text-xs text-zinc-600">{label}…</p>
        <span className="font-mono text-sm font-bold text-zinc-900">{pct}%</span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
        {COOK_STEPS.map((s, i) => {
          const done = (pct / 100) * COOK_STEPS.length > i;
          return (
            <div
              key={s}
              className={`h-1.5 rounded-full transition ${done ? "bg-pink" : "bg-black/[0.1]"}`}
              title={s}
            />
          );
        })}
      </div>
    </section>
  );
}

const COOK_STEPS = [
  "Reading your idea",
  "Naming the token",
  "Minting a ticker",
  "Sketching the logo",
  "Writing the hook",
  "Spinning the lore",
  "Drafting the thread",
  "Cooking memes",
  "Picking v1 or v2",
];

const ROULETTE_IDEAS = [
  "a cat coin that day-trades NVDA stock from the couch",
  "a dog that thinks it is a hedge fund manager",
  "a coffee bean that never sleeps and shorts the market",
  "an AI toaster that gives financial advice nobody asked for",
  "a pigeon delivering alpha faster than the news",
  "a rubber duck that debugs your portfolio",
  "a raccoon running a 24/7 midnight pump kitchen",
  "a snail that somehow front-runs every trade",
  "a goose guarding the liquidity pool with its life",
  "a lemon that turns every dip into lemonade",
  "a sloth that only buys, never sells, out of laziness",
  "a vending machine that pays dividends in snacks",
  "a frog that leaps from one narrative to the next",
  "a moon lander that refuses to come back down",
  "a printer that literally cannot stop printing",
  "a shark circling the order book at 3am",
  "a grandma outperforming every quant on the timeline",
  "a paper hand that reincarnated as diamond",
  "a traffic cone that stops rugs before they happen",
  "a rooster that wakes the market at the perfect bottom",
];

function formatCompact(weiSupply: string): string {
  const n = Number(BigInt(weiSupply) / 10n ** 18n);
  return Intl.NumberFormat("en", { notation: "compact" }).format(n);
}
