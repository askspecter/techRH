/**
 * Official / verified token addresses (lowercased). Only tokens listed here
 * get the official check badge in the UI. Curated in code on purpose, so the
 * badge cannot be spoofed by anyone launching a look-alike ticker.
 */
const OFFICIAL_TOKENS = new Set<string>([
  "0xe612c939d82981f8e17ccac3b59c1084c2aa02bb", // $CREO (official)
]);

export function isVerified(address?: string | null): boolean {
  return !!address && OFFICIAL_TOKENS.has(address.toLowerCase());
}
