"use client";

/**
 * The heavy half of "Pay with wallet": connect, switch chain, sign one transfer.
 * Loaded on demand by pay-with-wallet.tsx (next/dynamic, ssr: false).
 */

import { useAppKit, useAppKitAccount, useAppKitProvider, useDisconnect } from "@reown/appkit/react";
import { useAppKitConnection } from "@reown/appkit-adapter-solana/react";
import { createAssociatedTokenAccountIdempotentInstruction, createTransferCheckedInstruction, getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { ComputeBudgetProgram, PublicKey, SystemProgram, Transaction, type Connection, type TransactionInstruction } from "@solana/web3.js";
import { Check, ExternalLink, LoaderCircle, TriangleAlert, Wallet } from "lucide-react";
import { useRef, useState } from "react";
import { erc20Abi, isAddress } from "viem";
import { useT } from "@/lib/i18n";
import { useConfig, useConnection } from "wagmi";
import { sendTransaction, switchChain, waitForTransactionReceipt, writeContract } from "wagmi/actions";
import { EVM_CHAINS, shortAddress, txUrl, type WalletTarget } from "./chains";
import { WalletProvider } from "./wallet-provider";

export type WalletPayProps = {
  depositAddress: string;
  /** 1Click asset id of the deposit asset. */
  assetId: string;
  target: WalletTarget;
  /** Exact amount in base units (quote.amountIn). */
  amount: string;
  /** The same amount as an exact decimal string, for display. */
  amountLabel: string;
  symbol: string;
  decimals: number;
  deadline?: string;
};

type Phase =
  | { kind: "idle" }
  | { kind: "switching" }
  | { kind: "checking" }
  | { kind: "signing" }
  | { kind: "confirming"; hash: string }
  | { kind: "confirmed"; hash: string }
  | { kind: "error"; message: string; hash?: string; retry: boolean };

type Report = "idle" | "sent" | "failed";

export function WalletPay(props: WalletPayProps) {
  return (
    <WalletProvider>
      <Inner {...props} />
    </WalletProvider>
  );
}

/** Minimal shape of the AppKit Solana wallet provider we rely on. */
type SolanaWallet = { sendTransaction: (tx: Transaction, connection: Connection) => Promise<string> };

function Inner({ depositAddress, assetId, target, amount, amountLabel, symbol, decimals, deadline }: WalletPayProps) {
  const t = useT();
  const namespace = target.kind === "evm" ? "eip155" : "solana";
  const { open } = useAppKit();
  const { disconnect } = useDisconnect();
  const account = useAppKitAccount({ namespace });
  const config = useConfig();
  const evm = useConnection();
  const { walletProvider: solWallet } = useAppKitProvider<SolanaWallet | undefined>("solana");
  const { connection: solConnection } = useAppKitConnection();

  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [report, setReport] = useState<Report>("idle");
  const busy = useRef(false);

  const connected = account.isConnected && !!account.address;
  const wrongChain = target.kind === "evm" && connected && evm.chainId !== target.chainId;
  const currentChainName =
    target.kind === "solana"
      ? "Solana"
      : (Object.values(EVM_CHAINS).find((c) => c.chainId === evm.chainId)?.name ?? (evm.chainId ? t("order.wallet.chainId", { id: evm.chainId }) : "—"));
  const locked = phase.kind === "confirming" || phase.kind === "confirmed" || (phase.kind === "error" && !phase.retry);
  const working = phase.kind === "switching" || phase.kind === "checking" || phase.kind === "signing";

  const reportHash = async (txHash: string) => {
    try {
      const res = await fetch("/api/deposit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ txHash, depositAddress }),
      });
      setReport(res.ok ? "sent" : "failed");
    } catch {
      setReport("failed");
    }
  };

  const doSwitch = async () => {
    if (target.kind !== "evm" || busy.current) return;
    busy.current = true;
    setPhase({ kind: "switching" });
    try {
      await switchChain(config, { chainId: target.chainId });
      setPhase({ kind: "idle" });
    } catch (err) {
      setPhase({ kind: "error", message: errorText(err, t("order.wallet.switchFail", { chain: target.chainName }), t), retry: true });
    } finally {
      busy.current = false;
    }
  };

  const send = async () => {
    if (busy.current || locked) return;
    busy.current = true;
    try {
      if (deadline && Date.now() > Date.parse(deadline)) {
        setPhase({ kind: "error", message: t("order.wallet.closed"), retry: false });
        return;
      }
      setPhase({ kind: "checking" });
      const problem = await verifyOrder(depositAddress, assetId, amount, t);
      if (problem) {
        setPhase({ kind: "error", message: problem, retry: false });
        return;
      }
      setPhase({ kind: "signing" });

      if (target.kind === "evm") {
        if (!isAddress(depositAddress)) throw new Error(t("order.wallet.badEvm"));
        const value = BigInt(amount);
        const hash = target.token
          ? await writeContract(config, {
              address: target.token,
              abi: erc20Abi,
              functionName: "transfer",
              args: [depositAddress, value],
              chainId: target.chainId,
            })
          : await sendTransaction(config, { to: depositAddress, value, chainId: target.chainId });
        setPhase({ kind: "confirming", hash });
        void reportHash(hash);
        try {
          const receipt = await waitForTransactionReceipt(config, { hash, chainId: target.chainId });
          setPhase(
            receipt.status === "success"
              ? { kind: "confirmed", hash }
              : { kind: "error", message: t("order.wallet.failedOnchain"), hash, retry: true },
          );
        } catch {
          // Couldn't watch the receipt — the transaction may still land. The order status above stays authoritative.
          setPhase({ kind: "error", message: t("order.wallet.unconfirmed"), hash, retry: false });
        }
        return;
      }

      if (!solWallet || !solConnection || !account.address) throw new Error(t("order.wallet.solNotReady"));
      const conn = solConnection as unknown as Connection;
      const { tx, blockhash, lastValidBlockHeight } = await buildSolanaTransfer(conn, {
        owner: new PublicKey(account.address),
        to: new PublicKey(depositAddress),
        mint: target.mint,
        amount: BigInt(amount),
        decimals,
        t,
      });
      const signature = await solWallet.sendTransaction(tx, conn);
      setPhase({ kind: "confirming", hash: signature });
      void reportHash(signature);
      try {
        const res = await conn.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
        setPhase(
          res.value.err
            ? { kind: "error", message: t("order.wallet.failedOnchain"), hash: signature, retry: true }
            : { kind: "confirmed", hash: signature },
        );
      } catch {
        setPhase({ kind: "error", message: t("order.wallet.unconfirmed"), hash: signature, retry: false });
      }
    } catch (err) {
      setPhase({ kind: "error", message: errorText(err, t("order.wallet.didntGo"), t), retry: true });
    } finally {
      busy.current = false;
    }
  };

  const hash = "hash" in phase ? phase.hash : undefined;
  const [sendBefore, sendAfter = ""] = t("order.wallet.send", { symbol }).split("{amount}");

  return (
    <div className="mt-3 grid gap-3">
      {!connected ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => open({ view: "Connect", namespace })}
            className="btn-accent inline-flex h-11 items-center gap-2 px-4 text-[12px]"
          >
            <Wallet size={15} aria-hidden /> {t("order.wallet.connect", { kind: target.kind === "solana" ? "Solana" : "EVM" })}
          </button>
          {account.status === "connecting" || account.status === "reconnecting" ? (
            <span className="micro flex items-center gap-1.5" role="status">
              <LoaderCircle size={12} className="animate-spin-slow" aria-hidden /> {t("order.wallet.connecting")}
            </span>
          ) : null}
        </div>
      ) : (
        <>
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 border border-line bg-bg-2 px-3 py-2 text-[12px]">
            <span className="flex min-w-0 items-center gap-2">
              <span className="size-1.5 shrink-0 rounded-full bg-green" aria-hidden />
              <span className="sr-only">{t("order.wallet.connected")}</span>
              <span className="truncate font-mono text-fg" title={account.address} translate="no">
                {shortAddress(account.address ?? "")}
              </span>
              <span className="shrink-0 text-subtle">· {currentChainName}</span>
            </span>
            <span className="flex shrink-0 items-center gap-1">
              <button type="button" onClick={() => open({ view: "Account", namespace })} className="h-8 px-2 uppercase tracking-wider text-muted hover:text-fg">
                {t("order.wallet.wallet")}
              </button>
              <button
                type="button"
                onClick={() => disconnect({ namespace })}
                disabled={working}
                className="h-8 px-2 uppercase tracking-wider text-muted hover:text-fg disabled:opacity-50"
              >
                {t("order.wallet.disconnect")}
              </button>
            </span>
          </div>

          {!locked &&
            (wrongChain ? (
              <button
                type="button"
                onClick={doSwitch}
                disabled={working}
                className="inline-flex h-11 w-full items-center justify-center gap-2 border border-accent/60 px-4 text-[12px] uppercase tracking-wider text-fg hover:bg-accent/10 disabled:opacity-70 sm:w-auto"
              >
                {phase.kind === "switching" && <LoaderCircle size={14} className="animate-spin-slow" aria-hidden />}
                {t("order.wallet.switchTo", { chain: target.chainName })}
              </button>
            ) : (
              <button
                type="button"
                onClick={send}
                disabled={working}
                className="btn-accent inline-flex min-h-11 w-full min-w-0 items-center justify-center gap-2 px-4 py-2 text-[12px] disabled:opacity-80 sm:w-auto"
              >
                {working && <LoaderCircle size={14} className="shrink-0 animate-spin-slow" aria-hidden />}
                <span className="min-w-0 break-all">
                  {sendBefore}
                  <span className="tabular">{amountLabel}</span>
                  {sendAfter}
                </span>
              </button>
            ))}
        </>
      )}

      <div aria-live="polite" role="status" className="grid gap-2 text-[13px] empty:hidden">
        {phase.kind === "checking" && <p className="text-muted">{t("order.wallet.checking")}</p>}
        {phase.kind === "signing" && <p className="text-muted">{t("order.wallet.signing")}</p>}
        {phase.kind === "switching" && <p className="text-muted">{t("order.wallet.approveSwitch")}</p>}
        {phase.kind === "confirming" && (
          <p className="flex items-center gap-2 text-fg">
            <LoaderCircle size={14} className="animate-spin-slow" aria-hidden /> {t("order.wallet.submitted", { chain: target.chainName })}
          </p>
        )}
        {phase.kind === "confirmed" && (
          <p className="flex items-center gap-2 text-green">
            <Check size={14} aria-hidden /> {t("order.wallet.confirmed", { chain: target.chainName })}
          </p>
        )}
        {hash && (
          <a
            href={txUrl(target, hash)}
            target="_blank"
            rel="noreferrer"
            className="flex min-w-0 items-center justify-between gap-3 border border-line px-3 py-2 hover:border-line-strong"
          >
            <span className="micro">{t("order.wallet.tx")}</span>
            <span className="flex min-w-0 items-center gap-1.5 font-mono text-fg" translate="no">
              <span className="truncate">
                {hash.slice(0, 10)}…{hash.slice(-6)}
              </span>
              <ExternalLink size={13} className="shrink-0 text-subtle" aria-hidden />
              <span className="sr-only">{t("order.wallet.opensExplorer")}</span>
            </span>
          </a>
        )}
        {hash && report === "sent" && <p className="micro">{t("order.wallet.shared")}</p>}
      </div>

      {phase.kind === "error" && (
        <p role="alert" className="flex items-start gap-2 border border-red/30 bg-red/10 px-3 py-2.5 text-[13px] text-red">
          <TriangleAlert size={15} className="mt-0.5 shrink-0" aria-hidden />
          <span className="min-w-0 break-words">{phase.message}</span>
        </p>
      )}
    </div>
  );
}

/** Re-check the live order right before signing: still pending, same asset, same exact amount, no memo. */
type Translate = (key: string, vars?: Record<string, string | number>) => string;

async function verifyOrder(depositAddress: string, assetId: string, amount: string, t: Translate): Promise<string | null> {
  try {
    const res = await fetch(`/api/status?${new URLSearchParams({ address: depositAddress })}`, { cache: "no-store" });
    // A brand-new order can take a moment to be indexed; the amount came from the provider's quote, so carry on.
    if (!res.ok) return null;
    const body = await res.json();
    const q = body?.quoteResponse;
    if (body?.status && body.status !== "PENDING_DEPOSIT") return t("order.wallet.verify.detected");
    if (q?.quote?.depositMemo) return t("order.wallet.verify.memo");
    if (q?.quote?.amountIn && q.quote.amountIn !== amount) return t("order.wallet.verify.amount");
    if (q?.quoteRequest?.originAsset && q.quoteRequest.originAsset !== assetId) return t("order.wallet.verify.asset");
    return null;
  } catch {
    return null;
  }
}

const SOL_CU_PRICE = 200_000; // micro-lamports per compute unit — a modest priority fee

async function buildSolanaTransfer(
  conn: Connection,
  p: { owner: PublicKey; to: PublicKey; mint?: string; amount: bigint; decimals: number; t: Translate },
): Promise<{ tx: Transaction; blockhash: string; lastValidBlockHeight: number }> {
  const ixs: TransactionInstruction[] = [ComputeBudgetProgram.setComputeUnitPrice({ microLamports: SOL_CU_PRICE })];

  if (!p.mint) {
    ixs.push(ComputeBudgetProgram.setComputeUnitLimit({ units: 2_000 }), SystemProgram.transfer({ fromPubkey: p.owner, toPubkey: p.to, lamports: p.amount }));
  } else {
    const mint = new PublicKey(p.mint);
    const info = await conn.getAccountInfo(mint);
    if (!info) throw new Error(p.t("order.wallet.sol.noToken"));
    const owner = info.owner.toBase58();
    const programId =
      owner === TOKEN_PROGRAM_ID.toBase58() ? TOKEN_PROGRAM_ID : owner === TOKEN_2022_PROGRAM_ID.toBase58() ? TOKEN_2022_PROGRAM_ID : null;
    if (!programId) throw new Error(p.t("order.wallet.sol.program"));
    // Mint layout: decimals is the byte at offset 44 (same for Token and Token-2022).
    const mintDecimals = info.data.length > 44 ? info.data[44] : -1;
    if (mintDecimals !== p.decimals) throw new Error(p.t("order.wallet.sol.decimals"));
    const fromAta = getAssociatedTokenAddressSync(mint, p.owner, false, programId);
    const toAta = getAssociatedTokenAddressSync(mint, p.to, false, programId);
    ixs.push(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 100_000 }),
      // Creates the deposit address's token account only if it doesn't exist yet.
      createAssociatedTokenAccountIdempotentInstruction(p.owner, toAta, p.to, mint, programId),
      createTransferCheckedInstruction(fromAta, mint, toAta, p.owner, p.amount, p.decimals, [], programId),
    );
  }

  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
  const tx = new Transaction({ feePayer: p.owner, blockhash, lastValidBlockHeight }).add(...ixs);
  return { tx, blockhash, lastValidBlockHeight };
}

function errorText(err: unknown, fallback: string, t: Translate): string {
  const e = err as { name?: string; shortMessage?: string; message?: string; code?: number } | null;
  const msg = e?.shortMessage || e?.message || "";
  if (e?.name === "UserRejectedRequestError" || e?.code === 4001 || /reject|denied|cancel/i.test(msg)) return t("order.wallet.err.cancelled");
  if (/insufficient/i.test(msg)) return t("order.wallet.err.insufficient");
  if (!msg) return fallback;
  const firstLine = msg.split("\n")[0];
  return firstLine.length > 180 ? `${firstLine.slice(0, 180)}…` : firstLine;
}
