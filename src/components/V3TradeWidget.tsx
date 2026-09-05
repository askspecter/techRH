"use client";

import { useMemo, useState } from "react";
import { useAccount, useBalance, useReadContract, useWriteContract } from "wagmi";
import { formatEther, formatUnits, parseEther, parseUnits, type Address } from "viem";
import { v3SwapRouterAbi, erc20MiniAbi } from "@/lib/pons/abis";
import { PONS_V1 } from "@/lib/pons";
import { explorerTx, robinhoodChain } from "@/lib/chain";

/**
 * In-app trading for v1 tokens via the Uniswap V3 SwapRouter.
 *  - Buy: ETH → token in one tx (router wraps the ETH).
 *  - Sell: token → WETH (approve, then swap).
 * Min-out is estimated from the current spot price with a slippage buffer.
 */
export function V3TradeWidget({
  token,
  symbol,
  decimals,
  poolFee,
  priceInWeth,
}: {
  token: Address;
  symbol: string;
  decimals: number;
  poolFee: number;
  priceInWeth: number | null;
}) {
  const { address, isConnected } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [slippage, setSlippage] = useState(10);
  const [status, setStatus] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const router = PONS_V1.swapRouter;
  const weth = PONS_V1.weth;
  const fee = poolFee || 10000;

  // Live wallet balances: native ETH for buying, the token for selling.
  const { data: ethBal, refetch: refetchEth } = useBalance({ address, chainId: robinhoodChain.id });
  const { data: tokenBalRaw, refetch: refetchToken } = useReadContract({
    address: token,
    abi: erc20MiniAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const ethBalance = ethBal ? Number(formatEther(ethBal.value)) : 0;
  const tokenBalance = tokenBalRaw !== undefined ? Number(formatUnits(tokenBalRaw as bigint, decimals)) : 0;
  const balance = side === "buy" ? ethBalance : tokenBalance;
  const balanceSymbol = side === "buy" ? "ETH" : symbol;
  const insufficient = !!amount && Number(amount) > 0 && Number(amount) > balance;

  function fmtBal(x: number) {
    if (x === 0) return "0";
    if (x >= 1) return x.toLocaleString(undefined, { maximumFractionDigits: 4 });
    return x.toFixed(8).replace(/0+$/, "").replace(/\.$/, "");
  }

  function setMax() {
    if (side === "buy") {
      // Leave a little ETH for gas so the buy can't fail on fees.
      setAmount(String(Math.max(0, ethBalance - 0.0005)));
    } else {
      setAmount(tokenBalRaw !== undefined ? formatUnits(tokenBalRaw as bigint, decimals) : "0");
    }
  }

  const estimate = useMemo(() => {
    if (!priceInWeth || priceInWeth <= 0 || !amount || Number(amount) <= 0) return null;
    const a = Number(amount);
    if (side === "buy") return `≈ ${(a / priceInWeth).toLocaleString()} ${symbol}`;
    return `≈ ${(a * priceInWeth).toPrecision(4)} WETH`;
  }, [priceInWeth, amount, side, symbol]);

  function floatToUnits(x: number, dec: number): bigint {
    const clamped = Math.max(0, x);
    return parseUnits(clamped.toFixed(Math.min(dec, 12)), dec);
  }

  async function trade() {
    setError(null);
    if (!address) return;
    if (!priceInWeth || priceInWeth <= 0) {
      setError("No price available to estimate this trade.");
      return;
    }
    const factor = (100 - slippage) / 100;
    try {
      setStatus("busy");
      let hash: `0x${string}`;

      if (side === "buy") {
        const amountIn = parseEther(amount);
        const minTokens = floatToUnits((Number(amount) / priceInWeth) * factor, decimals);
        hash = await writeContractAsync({
          address: router,
          abi: v3SwapRouterAbi,
          functionName: "exactInputSingle",
          args: [
            { tokenIn: weth, tokenOut: token, fee, recipient: address, amountIn, amountOutMinimum: minTokens, sqrtPriceLimitX96: 0n },
          ],
          value: amountIn,
        });
      } else {
        const tokensIn = parseUnits(amount, decimals);
        const minWeth = parseEther(((Number(amount) * priceInWeth) * factor).toFixed(18));
        await writeContractAsync({
          address: token,
          abi: erc20MiniAbi,
          functionName: "approve",
          args: [router, tokensIn],
        });
        hash = await writeContractAsync({
          address: router,
          abi: v3SwapRouterAbi,
          functionName: "exactInputSingle",
          args: [
            { tokenIn: token, tokenOut: weth, fee, recipient: address, amountIn: tokensIn, amountOutMinimum: minWeth, sqrtPriceLimitX96: 0n },
          ],
        });
      }
      setTxHash(hash);
      setStatus("done");
      setAmount("");
      setTimeout(() => {
        refetchEth();
        refetchToken();
      }, 3000);
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message.split("\n")[0] : "Trade failed.");
    }
  }

  return (
    <section className="card p-4">
      <div className="mb-3 flex gap-2">
        {(["buy", "sell"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSide(s)}
            className={`btn flex-1 rounded-lg py-2 text-sm font-semibold ${side === s ? "bg-pink text-white" : "border border-ink-line text-zinc-700"}`}
          >
            {s === "buy" ? "Buy" : "Sell"}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between text-xs text-zinc-500">
        <span>{side === "buy" ? "Amount in ETH" : `Amount in ${symbol}`}</span>
        {isConnected && (
          <span>
            Balance: <span className="font-mono text-zinc-700">{fmtBal(balance)}</span> {balanceSymbol}
          </span>
        )}
      </div>
      <div className="mt-1 flex items-stretch gap-2">
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
          placeholder="0.0"
          inputMode="decimal"
          className="w-full rounded-lg border border-ink-line bg-white/70 px-3 py-2 font-mono text-sm outline-none focus:border-pink"
        />
        {isConnected && (
          <button onClick={setMax} className="btn-ghost shrink-0 !px-3 text-xs" disabled={balance <= 0}>
            Max
          </button>
        )}
      </div>
      {estimate && <p className="mt-2 text-xs text-zinc-500">{estimate}</p>}
      {insufficient && (
        <p className="mt-2 text-xs text-red-500">Insufficient {balanceSymbol} balance.</p>
      )}

      <div className="mt-3 flex items-center gap-2 text-xs text-zinc-500">
        <span>Slippage</span>
        {[1, 5, 10, 25].map((s) => (
          <button key={s} onClick={() => setSlippage(s)} className={`chip cursor-pointer ${slippage === s ? "border-pink text-pink" : ""}`}>
            {s}%
          </button>
        ))}
      </div>

      <button className="btn-brand mt-3 w-full" disabled={!isConnected || status === "busy" || !amount || insufficient} onClick={trade}>
        {status === "busy"
          ? "Confirm in wallet…"
          : insufficient
          ? `Insufficient ${balanceSymbol}`
          : side === "buy"
          ? `Buy ${symbol}`
          : `Sell ${symbol}`}
      </button>

      {!isConnected && <p className="mt-2 text-xs text-zinc-500">Connect your wallet to trade.</p>}
      {status === "done" && txHash && (
        <a className="mt-2 block text-xs underline" href={explorerTx(txHash)} target="_blank" rel="noreferrer">
          ✓ Trade sent - view on explorer
        </a>
      )}
      {side === "sell" && <p className="mt-2 text-[10px] text-zinc-500">Selling returns WETH; unwrap to ETH in your wallet.</p>}
      {error && <p className="mt-2 whitespace-pre-wrap text-xs text-red-500">{error}</p>}
    </section>
  );
}
