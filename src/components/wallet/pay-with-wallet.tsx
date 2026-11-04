"use client";

import dynamic from "next/dynamic";
import { LoaderCircle, Wallet, X } from "lucide-react";
import { useId, useState } from "react";
import { useT } from "@/lib/i18n";
import { fromBaseUnits } from "@/lib/tokens";
import { REOWN_PROJECT_ID, isBaseUnits, walletTarget, type PayAsset } from "./chains";

// AppKit, wagmi, viem and the Solana libraries load only after the user asks for them,
// and never on the server.
const WalletPay = dynamic(() => import("./wallet-pay").then((m) => m.WalletPay), {
  ssr: false,
  loading: () => <WalletLoading />,
});

function WalletLoading() {
  const t = useT();
  return (
    <p className="mt-3 flex items-center gap-2 text-[13px] text-muted" role="status">
      <LoaderCircle size={14} className="animate-spin-slow" aria-hidden /> {t("order.wallet.loading")}
    </p>
  );
}

export type PayWithWalletProps = {
  /** The order's one-time deposit address. */
  depositAddress: string;
  /** Deposit memo, if the order needs one. Wallet pay is never offered then. */
  memo?: string;
  /** 1Click asset id of the deposit asset (quoteRequest.originAsset). */
  assetId: string;
  /** The deposit asset from the token list (needs id/aliases/chain/decimals/contract). */
  asset: PayAsset | null | undefined;
  /** Exact amount in base units (quote.amountIn). */
  amount: string;
  /** Deposit deadline (ISO), checked again right before signing. */
  deadline?: string;
  /** Extra context line, e.g. for private-send legs. */
  note?: string;
  className?: string;
};

/**
 * "Pay with wallet" for a deposit. Renders nothing when wallet pay isn't configured
 * (no NEXT_PUBLIC_REOWN_PROJECT_ID), when the asset/chain isn't supported, or when a memo is required.
 */
export function PayWithWallet({ depositAddress, memo, assetId, asset, amount, deadline, note, className = "" }: PayWithWalletProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const headingId = useId();

  if (!REOWN_PROJECT_ID || memo || !asset || !isBaseUnits(amount)) return null;
  const target = walletTarget(asset, assetId);
  if (!target) return null;
  const amountLabel = fromBaseUnits(amount, asset.decimals);

  return (
    <section aria-labelledby={headingId} className={`min-w-0 border border-line bg-bg-2/60 p-4 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-56">
          <h3 id={headingId} className="label flex items-center gap-2 text-fg">
            <Wallet size={14} className="text-accent" aria-hidden /> {t("order.wallet.title")}
          </h3>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
            {t("order.wallet.body")}
          </p>
          {note && <p className="mt-1.5 text-[12px] leading-relaxed text-subtle">{note}</p>}
        </div>
        {open ? (
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label={t("order.wallet.close")}
            className="inline-flex size-9 shrink-0 items-center justify-center text-muted hover:text-fg"
          >
            <X size={16} aria-hidden />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-expanded={false}
            className="btn-accent inline-flex h-11 shrink-0 items-center gap-2 px-4 text-[12px]"
          >
            <Wallet size={15} aria-hidden /> {t("order.wallet.title")}
          </button>
        )}
      </div>
      {open && (
        <>
          <p className="micro mt-3">
            {target.chainName} ·{" "}
            {t(target.kind === "evm" ? (target.token ? "order.wallet.erc20" : "order.wallet.native") : target.mint ? "order.wallet.spl" : "order.wallet.native")} ·{" "}
            {t("order.wallet.via")}
          </p>
          {target.kind === "solana" && target.mint && (
            <p className="mt-1 text-[12px] leading-relaxed text-subtle">
              {t("order.wallet.rent", { symbol: asset.symbol })}
            </p>
          )}
          <WalletPay
            depositAddress={depositAddress}
            assetId={assetId}
            target={target}
            amount={amount}
            amountLabel={amountLabel}
            symbol={asset.symbol}
            decimals={asset.decimals}
            deadline={deadline}
          />
        </>
      )}
    </section>
  );
}
