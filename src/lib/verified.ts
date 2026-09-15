/**
 * Official / verified token addresses (lowercased). Only tokens listed here
 * get the official check badge in the UI. Curated in code on purpose, so the
 * badge cannot be spoofed by anyone launching a look-alike ticker.
 */
const OFFICIAL_TOKENS = new Set<string>([
  "0xe078416abc381000079c6db0c7bc9f03591e792f", // $CREO (official)
]);

export function isVerified(address?: string | null): boolean {
  return !!address && OFFICIAL_TOKENS.has(address.toLowerCase());
}
