/**
 * Official / verified token addresses (lowercased). Only tokens listed here
 * get the official check badge in the UI. Curated in code on purpose, so the
 * badge cannot be spoofed by anyone launching a look-alike ticker.
 */
const OFFICIAL_TOKENS = new Set<string>([
  "0xc85f085bc6a4ad8b50daf2251deab16189db659b", // $VERBO (official, v2)
]);

export function isVerified(address?: string | null): boolean {
  return !!address && OFFICIAL_TOKENS.has(address.toLowerCase());
}
