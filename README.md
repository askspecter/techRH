# 🌅 CREO — cinematic AI launchpad

**CREO** turns one sentence into a complete, launch-ready token and deploys it to
**[Pons](https://ponsfamily.com)** (the launchpad on Robinhood Chain). AI drafts the whole package,
you pick the launch model — **v1 or v2** — then **deploy in one click** through the Pons contracts.
Non-custodial: every transaction is signed by your own wallet.

> CREO is a third-party interface to the Pons protocol, not an official Pons product. Not financial advice.

## ✨ What it does

- **One sentence → full package:** name, ticker, logo, description, lore, a ready-to-post X thread, and meme prompts.
- **AI image generation:** regenerate the token art on demand in two styles — **Icon** (clean logo) or **Photo** (photorealistic, cinematic) — or upload your own.
- **Pick v1 / v2** with an AI recommendation:
  - **v1 — Instant Pool:** one tx deploys the token + a locked **Uniswap V3** pool (WETH). Tradable at once. Open, no whitelist.
  - **v2 — Bonding Curve:** fair launch that **graduates to Uniswap V4**. Supports RWA pairs (ETH/USDG/NVDA/AAPL/HOOD…). Creators paid in ETH.
- **On-chain ticker collision check** before you deploy.
- **Non-custodial** — `wagmi` + `viem` + RainbowKit; the user's wallet signs.

## 🧠 What's CREO vs. the engine

CREO reuses a proven **launch engine** (the Pons v1/v2 adapters, AI generation, on-chain readers,
and API routes) and wraps it in a brand-new **cinematic UI** built from scratch — a warm cream
canvas, a gold→orange→red sunset signature gradient (sampled from the CREO logo), hairline glass,
and a staged "reel" while the AI cooks.

```
Frontend (Next.js, CREO UI)  →  Version selector (v1/v2)
        → LaunchStrategy (interface)          ← engine
             ├─ PonsV1Adapter → Uniswap V3 pool (WETH)
             └─ PonsV2Adapter → bonding curve → graduate V4 (RWA)
        → Wallet (wagmi/viem, Robinhood Chain, non-custodial)
```

| Path | Contents |
|---|---|
| `src/lib/pons/` | v1/v2 adapters, registry (addresses), ABIs, on-chain readers — **engine** |
| `src/lib/ai/` | Launch-package generation, fallback SVG logo, availability check — **engine** |
| `src/lib/chain.ts` | Robinhood Chain definition (id 4663) — **engine** |
| `src/app/api/*` | `generate`, `launches`, `token`, `feed`, `v2/*` endpoints — **engine** |
| `src/app/`, `src/components/` | CREO's landing, studio, feed, and design system — **new UI** |

## 🚀 Running

```bash
cp .env.example .env.local   # set BANKR_API_KEY (or ANTHROPIC_API_KEY) at minimum
npm install
npm run dev                  # http://localhost:3000
```

Without an AI key the generate endpoint returns a 503; reading/indexing still works.
See `.env.example` for the full list (AI provider, WalletConnect, KV storage, chain overrides).

## 🧱 Stack

Next.js 14 (App Router) · TypeScript · Tailwind · wagmi + viem + RainbowKit · zod · Space Grotesk / Inter / JetBrains Mono.
