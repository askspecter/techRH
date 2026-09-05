import { createClient, type VercelKV } from "@vercel/kv";

/**
 * KV client that works across the common env namings: Vercel KV
 * (KV_REST_API_URL / KV_REST_API_TOKEN), an Upstash Redis marketplace
 * integration (UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN), or a
 * REST_API-suffixed variant. Values are trimmed so a stray space/newline from
 * pasting into the dashboard doesn't silently break detection.
 * Returns null when unconfigured so routes can respond 503 cleanly.
 */
let client: VercelKV | null = null;

function firstEnv(...names: string[]): string | undefined {
  for (const n of names) {
    const v = process.env[n]?.trim();
    if (v) return v;
  }
  return undefined;
}

/**
 * Fallback: some stores are linked with a custom env prefix (e.g.
 * MYSTORE_REST_API_URL / MYSTORE_REST_API_TOKEN). Find any REST url + matching
 * token pair sharing a prefix, so a correctly-provisioned store is detected even
 * under a non-standard name.
 */
function scanRestPair(): { url: string; token: string } | null {
  for (const [k, vRaw] of Object.entries(process.env)) {
    const v = vRaw?.trim();
    if (!v || !/^https?:\/\//i.test(v)) continue;
    const m = /^(.*)_REST(_API)?_URL$/.exec(k);
    if (!m) continue;
    const prefix = m[1];
    const suffix = m[2] ?? "";
    const token = firstEnv(`${prefix}_REST${suffix}_TOKEN`, `${prefix}_REST_API_TOKEN`, `${prefix}_REST_TOKEN`);
    if (token) return { url: v, token };
  }
  return null;
}

export function getKv(): VercelKV | null {
  if (client) return client;
  let url = firstEnv("KV_REST_API_URL", "UPSTASH_REDIS_REST_URL", "REDIS_REST_API_URL");
  let token = firstEnv("KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_TOKEN", "REDIS_REST_API_TOKEN");
  if (!url || !token) {
    const found = scanRestPair();
    if (found) {
      url = found.url;
      token = found.token;
    }
  }
  if (!url || !token) return null;
  client = createClient({ url, token });
  return client;
}
