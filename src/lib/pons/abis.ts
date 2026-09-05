import { parseAbi, parseAbiItem } from "viem";

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  Pons v1 - VERIFIED ABIs (from official docs.ponsfamily.com).
 *  These are READ + EVENT interfaces, authoritative for indexing/pricing.
 *
 *  ⚠️ The token-creating write function `launch()` is NOT part of the public
 *  read docs, so it is intentionally absent here. See registry.ts /
 *  ponsV1LaunchAbi for the deploy path (gated until the real ABI is added).
 * ─────────────────────────────────────────────────────────────────────────
 */

/** Emitted by the factory for every launch. Authoritative source of truth. */
export const tokenLaunchedEvent = parseAbiItem(
  "event TokenLaunched(address indexed token, address indexed deployer, address indexed dexFactory, address pairToken, address pool, uint256 dexId, uint256 launchConfigId, uint256 positionId, uint256 restrictionsEndBlock, uint256 initialBuyAmount)"
);

/** Uniswap V3 pool Swap event (per-pool trade feed). */
export const swapEvent = parseAbiItem(
  "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)"
);

/** Every launch token is self-describing on-chain. */
export const tokenAbi = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function logo() view returns (string)",
  "function description() view returns (string)",
  "function liquidityPool() view returns (address)",
  "function socials() view returns (string twitter, string telegram, string discord, string website, string farcaster)",
]);

/** Launch-level state lives on the factory that created the token. */
export const factoryReadAbi = parseAbi([
  "function getLaunchedToken(address token) view returns ((address token, address deployer, address pairedToken, address positionManager, uint256 positionId, uint256 dexId, uint256 launchConfigId, uint256 restrictionsEndBlock, uint256 supply, bool isToken0, uint24 poolFee, bool exists, uint256 initialBuyAmount) launched)",
  "function graduationStatus(address token) view returns (uint256 pairedPrincipal, uint256 threshold, bool graduated)",
  "function locker() view returns (address)",
]);

/** Uniswap V3 pool price source. */
export const poolAbi = parseAbi([
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
]);

/** Fee split + payout wallet, read from the locker resolved off the factory. */
export const lockerAbi = parseAbi([
  "function tokenProtocolFeeShares(address token) view returns (uint256)",
  "function feeRedirects(address token) view returns (address)",
  "function protocolFeeRecipient() view returns (address)",
]);

/**
 * VERIFIED v1 launch (write) ABI.
 *   launchToken(TokenParams params, uint256 launchConfigId, uint256 dexId, bytes32 salt) payable
 * params.socials is a 5-string tuple (twitter, telegram, discord, website, farcaster);
 * params.feeWallet is the creator fee recipient. Sent with the flat launch fee as value.
 */
export const v1LaunchAbi = parseAbi([
  "struct SocialsV1 { string twitter; string telegram; string discord; string website; string farcaster; }",
  "struct TokenParamsV1 { string name; string symbol; string logo; string description; SocialsV1 socials; address feeWallet; }",
  "function launchToken(TokenParamsV1 params, uint256 launchConfigId, uint256 dexId, bytes32 salt) payable",
]);

/** Uniswap V3 SwapRouter02 - single-hop swaps used for in-app v1 trading. */
export const v3SwapRouterAbi = parseAbi([
  "struct ExactInputSingleParams { address tokenIn; address tokenOut; uint24 fee; address recipient; uint256 amountIn; uint256 amountOutMinimum; uint160 sqrtPriceLimitX96; }",
  "function exactInputSingle(ExactInputSingleParams params) payable returns (uint256 amountOut)",
  "function unwrapWETH9(uint256 amountMinimum, address recipient) payable",
  "function refundETH() payable",
  "function multicall(bytes[] data) payable returns (bytes[] results)",
]);

/** Minimal ERC-20 for approvals/balances in the trade widget. */
export const erc20MiniAbi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
]);

/**
 * VERIFIED v1 locker (fee) ABI. The locker holds the permanent LP position and
 * collects trading fees. collectFees is the creator claim (also simulated via
 * eth_call to read the accrued amounts); setFeeRedirect changes the payout.
 */
export const v1LockerAbi = parseAbi([
  "function collectFees(address token) returns (uint256 amount0, uint256 amount1)",
  "function feeRedirects(address token) view returns (address recipient)",
  "function setFeeRedirect(address token, address newFeeWallet)",
  "function tokenProtocolFeeShares(address token) view returns (uint256 share)",
]);
