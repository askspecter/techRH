import { parseAbi, parseAbiItem } from "viem";

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  Pons v2 - VERIFIED ABIs (from official docs.ponsfamily.com/v2).
 *  Covers BOTH read and the write launch path (launchToken / launchAndBuy).
 *
 *  ⚠️ Per official docs: v2 is deployed but UNAUDITED, and public launches are
 *  closed - only whitelisted addresses can create a token. Always check
 *  canLaunch(address) before offering deploy.
 * ─────────────────────────────────────────────────────────────────────────
 */

/** Factory: launch write path, economics pin, configs, quote assets, gate. */
export const v2FactoryAbi = parseAbi([
  "struct Socials { string twitter; string telegram; string discord; string website; string farcaster; }",
  "struct TokenParams { string name; string symbol; string logo; string description; Socials socials; address creatorFeeRecipient; uint16 creatorTaxBps; bool buybackEnabled; bytes32 expectedEconomics; bytes32 salt; }",
  "struct LaunchConfig { uint256 supply; uint256 curveFeeBps; uint256 phantomQuote; uint256 graduationThreshold; uint24 poolFee; int24 tickSpacing; bool enabled; }",
  "struct LaunchedToken { address token; address curve; address deployer; address creatorFeeRecipient; address pairToken; uint256 graduationThreshold; uint24 poolFee; int24 tickSpacing; uint16 creatorTaxBps; bool buybackEnabled; uint8 phase; uint256 sweptQuote; uint256 sweptTokens; uint256 sweptAt; bool exists; }",
  // write
  // NOTE: the real factory launchToken has a 4th arg, address[] snipeTaxExemptions
  // (verified against a successful on-chain launch: selector 0xa72101af). Passing
  // an empty array is the normal case (no addresses exempted from the opening
  // snipe tax). The 3-arg form (0xf35abbcf) reverts.
  "function launchToken(TokenParams params, uint256 launchConfigId, address pairToken, address[] snipeTaxExemptions) payable returns (address token, address curve)",
  "function createGraduatedPool(address token)",
  // economics pin + fee
  "function previewLaunchEconomics(uint256 launchConfigId, address pairToken) view returns (bytes32)",
  "function launchFee() view returns (uint256)",
  // configs
  "function launchConfigCount() view returns (uint256)",
  "function getLaunchConfig(uint256 id) view returns (LaunchConfig)",
  // quote assets
  "function approvedPairTokens(address pairToken) view returns (bool)",
  "function pairTokenEconomics(address pairToken) view returns (uint256 phantomQuote, uint256 graduationThreshold, uint8 decimals)",
  // launch gate
  "function canLaunch(address account) view returns (bool)",
  "function maxCreatorTaxBps() view returns (uint16)",
  // launch record
  "function getLaunchedToken(address token) view returns (LaunchedToken)",
]);

/** Optional router: create a launch and buy into it in one transaction. */
export const v2LaunchAndBuyAbi = parseAbi([
  "struct Socials { string twitter; string telegram; string discord; string website; string farcaster; }",
  "struct TokenParams { string name; string symbol; string logo; string description; Socials socials; address creatorFeeRecipient; uint16 creatorTaxBps; bool buybackEnabled; bytes32 expectedEconomics; bytes32 salt; }",
  "function launchAndBuy(TokenParams params, uint256 launchConfigId, address pairToken, uint256 quoteIn, uint256 minTokensOut, address recipient, address[] snipeTaxExemptions) payable returns (address token, address curve, uint256 tokensOut)",
]);

/** Per-launch bonding curve: trading + pricing state + fee rates. */
export const v2CurveAbi = parseAbi([
  "function buy(uint256 quoteIn, uint256 minTokensOut, address recipient) payable returns (uint256 tokensOut)",
  "function sell(uint256 tokensIn, uint256 minQuoteOut, address recipient) returns (uint256 quoteOut)",
  "function isNativeQuote() view returns (bool)",
  "function pairToken() view returns (address)",
  "function getReserves() view returns (uint256 quoteReserve, uint256 tokenReserve)",
  "function realQuoteReserve() view returns (uint256)",
  "function graduationThreshold() view returns (uint256)",
  "function sellableTokens() view returns (uint256)",
  "function reservedTokens() view returns (uint256)",
  "function readyToGraduate() view returns (bool)",
  "function graduated() view returns (bool)",
  "function feeBps() view returns (uint256)",
  "function creatorTaxBps() view returns (uint256)",
  "function buybackEnabled() view returns (bool)",
  "function currentSnipeTaxBps(address recipient) view returns (uint256)",
]);

/** v2 launch token: standard ERC-20 + creator metadata in one call. */
export const v2TokenAbi = parseAbi([
  "struct Socials { string twitter; string telegram; string discord; string website; string farcaster; }",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function getTokenInfo() view returns (address tokenDeployer, string tokenLogo, string tokenDescription, Socials tokenSocials)",
]);

/** Factory TokenLaunched event (v2 signature differs from v1). */
export const v2TokenLaunchedEvent = parseAbiItem(
  "event TokenLaunched(address indexed token, address indexed curve, address indexed deployer, address pairToken, uint256 launchConfigId, uint256 graduationThreshold)"
);

/** Curve trade events. */
export const v2CurveBuyEvent = parseAbiItem(
  "event CurveBuy(address indexed buyer, address indexed recipient, uint256 quoteIn, uint256 tokensOut, uint256 fee, uint256 tax)"
);
export const v2CurveSellEvent = parseAbiItem(
  "event CurveSell(address indexed seller, address indexed recipient, uint256 tokensIn, uint256 quoteOut, uint256 fee, uint256 tax)"
);

/** Fee escrow - creators claim accrued fees here (native + per ERC-20). */
export const v2FeeEscrowAbi = parseAbi([
  "function balanceOf(address recipient) view returns (uint256)",
  "function balanceOfToken(address recipient, address token) view returns (uint256)",
  "function claim()",
  "function claimToken(address token)",
]);

/** Launch phase enum from the factory launch record. */
export const V2_PHASE = {
  0: "NotGraduated",
  1: "Swept",
  2: "PoolCreated",
  3: "Rescued",
} as const;
export type V2Phase = keyof typeof V2_PHASE;
