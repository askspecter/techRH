"use client";

import { useState } from "react";
import { useAccount, usePublicClient, useSwitchChain, useWriteContract } from "wagmi";
import { BaseError, ContractFunctionRevertedError, parseEventLogs, type Abi } from "viem";
import { type LaunchInput } from "@/lib/pons";
import { toOnchainLogo } from "@/lib/upload";
import { v2TokenLaunchedEvent } from "@/lib/pons/abisV2";
import { tokenLaunchedEvent } from "@/lib/pons/abis";
import { o1LaunchedEvent } from "@/lib/o1/events";
import { LAUNCH_TARGETS, type LaunchTarget } from "@/lib/launch/targets";

/**
 * Deploy path is engine logic (unchanged from the reference): the active
 * Pons strategy prepares a plan, the user's wallet signs writeContract, then
 * we parse the receipt for the new token address and record it to the feed.
 * Only the presentation here is CREO's.
 */
export function DeployButton({
  input,
  disabled,
  target = LAUNCH_TARGETS.arc,
}: {
  input: LaunchInput;
  disabled?: boolean;
  /** Which chain + launch model to deploy to (Arc or Robinhood). */
  target?: LaunchTarget;
}) {
  const { address, isConnected, chainId } = useAccount();
  const publicClient = usePublicClient({ chainId: target.chain.id });
  const { switchChainAsync, isPending: switching } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const [status, setStatus] = useState<"idle" | "preparing" | "signing" | "sent" | "error">("idle");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  const { chain } = target;
  const strategy = target.strategy;
  const ready = strategy.info().ready;

  async function recordLaunch(hash: `0x${string}`, logo: string) {
    if (!address) return;

    // Fast path: try to read the token straight from the receipt. This relies
    // on the browser reaching the RPC, so it may fail - that's fine, the server
    // resolves the token from the txHash via Blockscout when it's missing.
    let token = "";
    let curve: string | undefined;
    try {
      if (publicClient) {
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        const logs = [
          ...parseEventLogs({ abi: [o1LaunchedEvent], logs: receipt.logs }),
          ...parseEventLogs({ abi: [v2TokenLaunchedEvent], logs: receipt.logs }),
          ...parseEventLogs({ abi: [tokenLaunchedEvent], logs: receipt.logs }),
        ];
        const args = logs.find((l) => (l.args as { token?: string })?.token)?.args as
          | { token?: string; curve?: string }
          | undefined;
        token = args?.token ?? "";
        curve = args?.curve;
      }
    } catch {
      // ignore - the server will resolve from txHash
    }

    const payload = {
      token,
      curve,
      version: target.version,
      name: input.name,
      symbol: input.ticker,
      // Hosted short URL (never the raw data URI, which KV would truncate to a
      // broken image), matching the on-chain logo.
      logo,
      twitter: input.twitter,
      telegram: input.telegram,
      website: input.website,
      deployer: address,
      txHash: hash,
      rewardToken: input.rewardToken,
    };

    // POST with a few retries: if the server can't resolve the token yet
    // (Blockscout still indexing the tx), it returns 202 - back off and retry.
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const res = await fetch("/api/launches", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.status !== 202) return; // stored, deduped, or a hard error
      } catch {
        // network hiccup - retry
      }
      await new Promise((r) => setTimeout(r, 4000));
    }
  }

  // Pull the most specific revert reason out of a viem error (custom error
  // name, revert string, or short message) so the user sees the real cause.
  function revertReason(err: unknown): string {
    if (err instanceof BaseError) {
      const revert = err.walk((e) => e instanceof ContractFunctionRevertedError);
      if (revert instanceof ContractFunctionRevertedError) {
        const name = revert.data?.errorName;
        if (name) return `${name}${revert.reason ? ` - ${revert.reason}` : ""}`;
        if (revert.reason) return revert.reason;
      }
      return err.shortMessage || err.message;
    }
    return err instanceof Error ? err.message.split("\n")[0] : "unknown error";
  }

  async function deploy() {
    setError(null);
    setWarnings([]);
    if (!address) return;
    try {
      if (chainId !== chain.id) {
        try {
          await switchChainAsync({ chainId: chain.id });
        } catch {
          throw new Error(
            `Your wallet must be on ${chain.name} (chain ${chain.id}). ` +
              `Switch networks in your wallet - this is an EVM chain, not Solana - then try again.`
          );
        }
      }
      setStatus("preparing");
      // On-chain metadata must be short - a data-URI logo (e.g. AI-generated)
      // makes the factory revert with MetadataTooLong(). Replace it with a short
      // stored URL, and keep the description within a safe length.
      const onchainLogo = await toOnchainLogo(input.imageUri);
      const safeInput: LaunchInput = {
        ...input,
        imageUri: onchainLogo,
        description: (input.description ?? "").slice(0, 500),
      };
      const plan = await strategy.prepareLaunch(safeInput, address);
      setWarnings(plan.warnings);

      // Pre-flight: simulate against the chain to surface the EXACT revert
      // reason (no gas spent) instead of a mystery failure. If this passes, the
      // real transaction will go through.
      if (publicClient) {
        try {
          await publicClient.simulateContract({
            account: address,
            address: plan.address,
            abi: plan.abi as Abi,
            functionName: plan.functionName,
            args: plan.args as unknown[],
            value: plan.value,
          });
        } catch (simErr) {
          throw new Error("This launch would revert on-chain. Reason: " + revertReason(simErr));
        }
      }

      setStatus("signing");
      const hash = await writeContractAsync({
        address: plan.address,
        abi: plan.abi as Abi,
        functionName: plan.functionName,
        args: plan.args as unknown[],
        value: plan.value,
        // Enforce the network on the tx itself, so a wallet still on another
        // chain (e.g. Solana) gets a clear chain-mismatch error instead of
        // silently sending - and never lands on the wrong network.
        chainId: chain.id,
      });
      setTxHash(hash);
      setStatus("sent");
      void recordLaunch(hash, onchainLogo);
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Transaction failed.");
    }
  }

  if (status === "sent" && txHash) {
    return (
      <div className="space-y-2">
        <a className="btn-brand w-full" href={target.explorerTx(txHash)} target="_blank" rel="noreferrer">
          ✓ Launched - view on explorer
        </a>
        <a href="/feed" className="btn-ghost w-full">See it in the feed →</a>
      </div>
    );
  }

  // Connected but on the wrong network → a prominent "Switch to <chain>"
  // button instead of Deploy, so the network fix is one tap.
  if (isConnected && chainId !== chain.id) {
    return (
      <div className="space-y-2">
        <button
          className="btn-brand w-full"
          disabled={switching}
          onClick={async () => {
            try {
              await switchChainAsync({ chainId: chain.id });
            } catch {
              /* user rejected or wallet still on another network */
            }
          }}
        >
          {switching ? "Switching…" : `Switch to ${chain.name}`}
        </button>
        <p className="text-xs text-zinc-500">
          This launch deploys on {chain.name} (an EVM chain, not Solana). Switch to deploy.
        </p>
      </div>
    );
  }

  const blocked = disabled || !ready || !isConnected;
  const busy = status === "preparing" || status === "signing";
  const label =
    status === "preparing"
      ? "Reading on-chain…"
      : status === "signing"
        ? "Sign in your wallet…"
        : `Deploy · ${target.label}`;

  return (
    <div className="space-y-2">
      {warnings.length > 0 && (
        <ul className="space-y-1 rounded-xl border border-ember/30 bg-ember/[0.06] p-3 text-xs text-ember-soft">
          {warnings.map((w, i) => (
            <li key={i}>⚠ {w}</li>
          ))}
        </ul>
      )}
      <button className="btn-brand w-full" disabled={blocked || busy} onClick={deploy}>
        {busy && (
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
        )}
        {label}
      </button>
      {!ready && <p className="text-xs text-zinc-500">Deploy for {input.version} is currently unavailable.</p>}
      {!isConnected && ready && <p className="text-xs text-zinc-500">Connect your wallet to deploy.</p>}
      {error && <p className="whitespace-pre-wrap text-xs text-red-600">{error}</p>}
    </div>
  );
}
