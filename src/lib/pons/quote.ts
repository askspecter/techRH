/**
 * Pons v2 bonding-curve quoting - pure integer math, reproduced from the
 * official docs in the curve's own order. A router/aggregator computes price
 * from reserves + fee rates rather than calling the curve.
 *
 * The two directions are NOT symmetric:
 *  - a buy charges fees on the way IN (off the quote amount first);
 *  - a sell is priced first and fees come off the OUTPUT.
 * Only buys carry the snipe tax.
 */

const BPS = 10_000n;
const ceilDiv = (a: bigint, b: bigint) => (a + b - 1n) / b;

/** Constant product, no fee (both directions charge fees outside this step). */
function amountOut(inAmount: bigint, reserveIn: bigint, reserveOut: bigint): bigint {
  return (inAmount * reserveOut) / (reserveIn + inAmount);
}
function amountIn(outAmount: bigint, reserveIn: bigint, reserveOut: bigint): bigint {
  return (outAmount * reserveIn) / (reserveOut - outAmount) + 1n;
}

export interface CurveQuoteInputs {
  quoteReserve: bigint; // getReserves()[0] - includes phantom, excludes accrued fees
  tokenReserve: bigint; // getReserves()[1]
  sellableTokens: bigint;
  feeBps: bigint;
  creatorTaxBps: bigint;
  snipeBps?: bigint; // currentSnipeTaxBps(recipient); buys only
}

export interface BuyQuote {
  tokensOut: bigint;
  spent: bigint;
  refund: bigint;
}

/** Quote asset in → launch token out. */
export function quoteBuy(quoteIn: bigint, i: CurveQuoteInputs): BuyQuote {
  const feeBps = i.feeBps;
  const creatorTaxBps = i.creatorTaxBps;

  // Snipe tax is capped so the buyer always nets at least 1% of spend.
  let snipeBps = i.snipeBps ?? 0n;
  if (snipeBps > 0n) {
    const maxSnipeBps = BPS - feeBps - creatorTaxBps - 100n;
    if (snipeBps > maxSnipeBps) snipeBps = maxSnipeBps;
  }

  let spent = quoteIn;
  const fee = (spent * feeBps) / BPS;
  const tax = (spent * creatorTaxBps) / BPS;
  const snipeTax = (spent * snipeBps) / BPS;
  let tokensOut = amountOut(spent - fee - tax - snipeTax, i.quoteReserve, i.tokenReserve);

  // A buy crossing the reserved allocation fills to the edge; input repriced
  // from the token side so the rest is refunded.
  if (tokensOut > i.sellableTokens) {
    tokensOut = i.sellableTokens;
    const net = amountIn(i.sellableTokens, i.quoteReserve, i.tokenReserve);
    const grossed = ceilDiv(net * BPS, BPS - feeBps - creatorTaxBps - snipeBps);
    spent = grossed < quoteIn ? grossed : quoteIn;
  }

  return { tokensOut, spent, refund: quoteIn - spent };
}

/** Launch token in → quote asset out. No snipe tax on this side. */
export function quoteSell(tokensIn: bigint, i: CurveQuoteInputs): bigint {
  const gross = amountOut(tokensIn, i.tokenReserve, i.quoteReserve);
  const fee = (gross * i.feeBps) / BPS;
  const tax = (gross * i.creatorTaxBps) / BPS;
  return gross - fee - tax;
}

/** Apply a slippage tolerance (in bps) to a quoted output → a min-out floor. */
export function withSlippage(amount: bigint, slippageBps: number): bigint {
  return (amount * BigInt(10_000 - slippageBps)) / 10_000n;
}
