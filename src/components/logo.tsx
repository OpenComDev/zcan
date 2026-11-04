import Image from "next/image";
import Link from "@/components/locale-link";

/** Zcan mark: the white leaf tile with the watchful eye (transparent PNG). A soft edge shadow on light pages. */
export function LogoMark({ size = 34, className = "" }: { size?: number; className?: string }) {
  return <Image src="/zcan-logo.png" alt="" aria-hidden width={size} height={size} className={`shrink-0 light:drop-shadow-[0_1px_1.5px_rgb(24_22_18/0.28)] ${className}`} priority />;
}

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5" aria-label="Zcan home">
      <LogoMark />
      <span className="text-[20px] font-medium uppercase tracking-wide text-fg" translate="no">
        Zcan
      </span>
    </Link>
  );
}
