"use client";

import { useMemo, useState } from "react";
import { useAccount, useBalance, useReadContract, useWriteContract } from "wagmi";
import { formatEther, formatUnits, parseAbi, parseEther, parseUnits, zeroAddress, type Address } from "viem";
import { v2CurveAbi } from "@/lib/pons/abisV2";
import { quoteBuy, quoteSell, withSlippage } from "@/lib/pons/quote";
import { explorerTx, robinhoodChain } from "@/lib/chain";

const erc20Abi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
]);

interface CurveInfo {
  quoteReserve: string;
  tokenReserve: string;
  sellableTokens: string;
  feeBps: string;
  creatorTaxBps: string;
}

export function CurveTradeWidget({
  curveAddress,
  token,
  symbol,
  decimals,
  pairToken,
  curve,
}: {
  curveAddress: Address;
  token: Address;
  symbol: string;
  decimals: number;
  pairToken: Address;
  curve: CurveInfo;
}) {
  const { address, isConnected } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [slippage, setSlippage] = useState(5);
  const [status, setStatus] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isNative = pairToken === zeroAddress;

  // Live wallet balances. Buy spends the quote asset (native ETH, or the ERC-20
  // quote token); sell spends the launch token. Curve quote math is 18-dec
  // (parseEther), so the ERC-20 quote balance is read/formatted at 18 too.
  const { data: ethBal, refetch: refetchEth } = useBalance({
    address,
    chainId: robinhoodChain.id,
    query: { enabled: !!address && isNative },
  });
  const { data: quoteBalRaw, refetch: refetchQuote } = useReadContract({
    address: pairToken,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: robinhoodChain.id,
    query: { enabled: !!address && !isNative },
  });
  const { data: tokenBalRaw, refetch: refetchToken } = useReadContract({
    address: token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: robinhoodChain.id,
    query: { enabled: !!address },
  });

  const quoteSymbol = isNative ? "ETH" : "quote";
  const quoteBalance = isNative
    ? ethBal
      ? Number(formatEther(ethBal.value))
      : 0
    : quoteBalRaw !== undefined
    ? Number(formatEther(quoteBalRaw as bigint))
    : 0;
  const tokenBalance = tokenBalRaw !== undefined ? Number(formatUnits(tokenBalRaw as bigint, decimals)) : 0;
  const balance = side === "buy" ? quoteBalance : tokenBalance;
  const balanceSymbol = side === "buy" ? quoteSymbol : symbol;
  const insufficient = !!amount && Number(amount) > 0 && Number(amount) > balance;

  function fmtBal(x: number) {
    if (x === 0) return "0";
    if (x >= 1) return x.toLocaleString(undefined, { maximumFractionDigits: 4 });
    return x.toFixed(8).replace(/0+$/, "").replace(/\.$/, "");
  }

  function setMax() {
    if (side === "buy") {
      setAmount(isNative ? String(Math.max(0, quoteBalance - 0.0005)) : String(quoteBalance));
    } else {
      setAmount(tokenBalRaw !== undefined ? formatUnits(tokenBalRaw as bigint, decimals) : "0");
    }
  }

  const inputs = useMemo(
    () => ({
      quoteReserve: BigInt(curve.quoteReserve),
      tokenReserve: BigInt(curve.tokenReserve),
      sellableTokens: BigInt(curve.sellableTokens),
      feeBps: BigInt(curve.feeBps),
      creatorTaxBps: BigInt(curve.creatorTaxBps),
    }),
    [curve]
  );

  // Live estimate (snipe tax assumed 0 - may be higher in a launch's first seconds).
  const estimate = useMemo(() => {
    try {
      if (!amount || Number(amount) <= 0) return null;
      if (side === "buy") {
        const q = quoteBuy(parseEther(amount), inputs);
        return `≈ ${Number(formatUnits(q.tokensOut, decimals)).toLocaleString()} ${symbol}`;
      }
      const out = quoteSell(parseUnits(amount, decimals), inputs);
      return `≈ ${Number(formatUnits(out, 18)).toFixed(6)} ETH`;
    } catch {
      return null;
    }
  }, [amount, side, inputs, decimals, symbol]);

  async function trade() {
    setError(null);
    if (!address) return;
    try {
      setStatus("busy");
      let hash: `0x${string}`;

      if (side === "buy") {
        const quoteIn = parseEther(amount);
        const q = quoteBuy(quoteIn, inputs);
        const minOut = withSlippage(q.tokensOut, slippage);
        hash = await writeContractAsync({
          address: curveAddress,
          abi: v2CurveAbi,
          functionName: "buy",
          args: [quoteIn, minOut, address],
          value: isNative ? quoteIn : 0n,
        });
      } else {
        const tokensIn = parseUnits(amount, decimals);
        const out = quoteSell(tokensIn, inputs);
        const minOut = withSlippage(out, slippage);
        // Sell pulls launch tokens from the seller → approve the curve first.
        await writeContractAsync({
          address: token,
          abi: erc20Abi,
          functionName: "approve",
          args: [curveAddress, tokensIn],
        });
        hash = await writeContractAsync({
          address: curveAddress,
          abi: v2CurveAbi,
          functionName: "sell",
          args: [tokensIn, minOut, address],
        });
      }

      setTxHash(hash);
      setStatus("done");
      setAmount("");
      setTimeout(() => {
        refetchEth();
        refetchQuote();
        refetchToken();
      }, 3000);
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message.split("\n")[0] : "Trade failed.");
    }
  }

  return (
    <div className="card p-4">
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
        <span>{side === "buy" ? `Amount in ${quoteSymbol}` : `Amount in ${symbol}`}</span>
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

      {estimate && <p className="mt-2 text-xs text-zinc-600">{estimate}</p>}
      {insufficient && <p className="mt-2 text-xs text-red-600">Insufficient {balanceSymbol} balance.</p>}

      <div className="mt-3 flex items-center gap-2 text-xs text-zinc-500">
        <span>Slippage</span>
        {[1, 5, 10].map((s) => (
          <button
            key={s}
            onClick={() => setSlippage(s)}
            className={`chip cursor-pointer ${slippage === s ? "border-pink text-pink" : ""}`}
          >
            {s}%
          </button>
        ))}
      </div>

      <button
        className="btn-brand mt-3 w-full"
        disabled={!isConnected || status === "busy" || !amount || insufficient}
        onClick={trade}
      >
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
        <a className="mt-2 block text-xs text-pink" href={explorerTx(txHash)} target="_blank" rel="noreferrer">
          ✓ Trade sent - view on explorer
        </a>
      )}
      {error && <p className="mt-2 whitespace-pre-wrap text-xs text-red-600">{error}</p>}
      <p className="mt-2 text-[10px] text-zinc-500">
        Estimate assumes 0 snipe tax; a launch&apos;s opening seconds may tax buys more - raise slippage if it reverts.
      </p>
    </div>
  );
}
