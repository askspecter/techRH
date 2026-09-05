import { explorerUrl } from "../chain";

export interface AvailabilityResult {
  ticker: string;
  taken: boolean;
  matches: Array<{ name: string; symbol: string; address: string }>;
  note: string;
}

/**
 * Best-effort on-chain availability check for a ticker.
 *
 * Token symbols are NOT unique on an EVM chain - anyone can deploy "$DOGE".
 * So this is a collision *warning*, not a hard reservation: we query the
 * Blockscout token search on Robinhood Chain and report existing matches so
 * the creator can pick a less-crowded ticker.
 */
export async function checkTickerAvailability(ticker: string): Promise<AvailabilityResult> {
  const symbol = ticker.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const empty: AvailabilityResult = {
    ticker: symbol,
    taken: false,
    matches: [],
    note: "Token symbols aren't guaranteed unique on-chain. This is a collision warning, not a reservation.",
  };
  if (!symbol) return empty;

  try {
    const res = await fetch(
      `${explorerUrl}/api/v2/tokens?q=${encodeURIComponent(symbol)}&type=ERC-20`,
      { headers: { accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(6000) }
    );
    if (!res.ok) return empty;

    const data = (await res.json()) as { items?: Array<Record<string, unknown>> };
    const items = data.items ?? [];
    const matches = items
      .filter((t) => String(t.symbol ?? "").toUpperCase() === symbol)
      .slice(0, 5)
      .map((t) => ({
        name: String(t.name ?? ""),
        symbol: String(t.symbol ?? ""),
        address: String(t.address ?? t.address_hash ?? ""),
      }));

    return { ...empty, taken: matches.length > 0, matches };
  } catch {
    // Explorer unreachable → don't block the flow, just say we couldn't check.
    return { ...empty, note: "Couldn't reach the explorer to check availability right now." };
  }
}
