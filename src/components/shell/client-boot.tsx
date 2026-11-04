"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { trackPageview } from "@/lib/analytics";
import { installErrorReporting } from "@/lib/error-report";
import { captureReferral } from "@/lib/referral-store";

/**
 * Starts crash reporting (src/lib/error-report.ts), remembers a referral link (src/lib/referral-store.ts)
 * and counts page views (src/lib/analytics.ts — off unless
 * analytics is configured). Mounted once in the root layout; renders nothing.
 */
export function ClientBoot() {
  const pathname = usePathname();
  useEffect(() => {
    installErrorReporting();
    captureReferral();
  }, []);
  useEffect(() => {
    trackPageview(pathname);
  }, [pathname]);
  return null;
}
