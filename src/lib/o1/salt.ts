/**
 * Token-address prediction + salt mining for the o1 `launchpad-v4-minimal`
 * factory on Arc (ERC-20 token mode). Ported verbatim from o1's own reference
 * (o1Bot/TweetLaunch, packages/executor/src/salt.ts), which mirrors the
 * verified source (LaunchpadFactoryCore._prepareLaunch and
 * LaunchTokenDeployer._predictTokenAddress):
 *
 *   scopedSalt = keccak256(abi.encode(creator, creatorSalt))
 *   token      = CREATE2(deployer, scopedSalt, keccak256(creationCode ++ abi.encode(genesisParams)))
 *
 * The genesis params carry neither creator nor salt, so the bytecode hash is
 * read once (`launchTokenBytecodeHash`) and the salt is mined locally until the
 * predicted token address ends in the required 0x01 suffix.
 */
import {
  concatHex,
  encodeAbiParameters,
  getAddress,
  getContractAddress,
  keccak256,
  numberToHex,
  toHex,
  type Address,
  type Hex,
} from "viem";

export function scopedSalt(creator: Address, creatorSalt: Hex): Hex {
  return keccak256(encodeAbiParameters([{ type: "address" }, { type: "bytes32" }], [creator, creatorSalt]));
}

export function predictTokenAddress(deployer: Address, scoped: Hex, bytecodeHash: Hex): Address {
  return getContractAddress({ opcode: "CREATE2", from: deployer, salt: scoped, bytecodeHash });
}

/** True when the address' lowest byte equals `suffix` (o1 requires 0x01). */
export function hasSuffix(address: Address, suffix: number): boolean {
  return Number.parseInt(address.slice(-2), 16) === suffix;
}

export type MinedSalt = {
  creatorSalt: Hex;
  scopedSalt: Hex;
  token: Address;
  attempts: number;
};

export type MineInput = {
  creator: Address;
  deployer: Address;
  bytecodeHash: Hex;
  suffix: number;
  /** 32-byte seed; random when omitted. Same seed + inputs → same result. */
  seed?: Hex;
  maxAttempts?: number;
};

/** A random 32-byte seed using the browser/Web Crypto API. */
export function randomSeed(): Hex {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

/**
 * Search creatorSalt = keccak256(seed ++ i) until the predicted token ends in
 * `suffix`. One byte of freedom → 256 attempts on average, microseconds each.
 */
export function mineCreatorSalt(input: MineInput): MinedSalt {
  const seed = input.seed ?? randomSeed();
  const max = input.maxAttempts ?? 65_536;
  for (let i = 0; i < max; i++) {
    const creatorSalt = keccak256(concatHex([seed, numberToHex(i, { size: 32 })]));
    const scoped = scopedSalt(input.creator, creatorSalt);
    const token = predictTokenAddress(input.deployer, scoped, input.bytecodeHash);
    if (hasSuffix(token, input.suffix)) return { creatorSalt, scopedSalt: scoped, token: getAddress(token), attempts: i + 1 };
  }
  throw new Error(`no salt with suffix 0x${input.suffix.toString(16).padStart(2, "0")} found in ${max} attempts`);
}
