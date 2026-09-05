import { pairAssetSymbol } from "@/lib/pons/registry";

/**
 * "Paired with X" pill for the token header. Resolves the paired/quote asset
 * ticker from its address (ETH for native / WETH, known quote tickers, else a
 * short address).
 */
export function PairedWithChip({ pairToken }: { pairToken?: string | null }) {
  const symbol = pairAssetSymbol(pairToken);
  return (
    <span className="chip chip-accent gap-1.5">
      <span className="text-zinc-500">Paired with</span>
      <span className="font-bold">{symbol}</span>
    </span>
  );
}
