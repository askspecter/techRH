/**
 * Official / verified token addresses (lowercased). Only tokens listed here
 * get the official check badge in the UI. Curated in code on purpose, so the
 * badge cannot be spoofed by anyone launching a look-alike ticker.
 */
const OFFICIAL_TOKENS = new Set<string>([
  "0x1c98d896328c35a751ce18323f47139a44188001", // $CREO (official, Arc)
]);

export function isVerified(address?: string | null): boolean {
  return !!address && OFFICIAL_TOKENS.has(address.toLowerCase());
}
