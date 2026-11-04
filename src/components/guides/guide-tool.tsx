"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import type { EmbedTool } from "@/lib/guides";

const Loading = () => <div className="panel h-[320px] animate-pulse" aria-busy="true" />;

/** Each guide loads only its own tool. */
const TOOLS: Record<EmbedTool, ComponentType> = {
  link: dynamic(
    () =>
      import("@/components/link-cleaner").then((m) => {
        const LinkCleanerOnly = () => <m.LinkCleaner withTrail={false} />;
        return LinkCleanerOnly;
      }),
    { loading: Loading },
  ),
  photo: dynamic(() => import("@/components/photo-cleaner").then((m) => m.PhotoCleaner), { loading: Loading }),
  address: dynamic(() => import("@/components/tools/address-checker").then((m) => m.AddressChecker), { loading: Loading }),
  passwords: dynamic(() => import("@/components/tools/password-check").then((m) => m.PasswordCheck), { loading: Loading }),
  fingerprint: dynamic(() => import("@/components/tools/fingerprint-test").then((m) => m.FingerprintTest), { loading: Loading }),
  clipboard: dynamic(() => import("@/components/tools/clipboard-guard").then((m) => m.ClipboardGuard), { loading: Loading }),
  documents: dynamic(() => import("@/components/tools/document-cleaner").then((m) => m.DocumentCleaner), { loading: Loading }),
};

export function GuideTool({ tool }: { tool: EmbedTool }) {
  const Tool = TOOLS[tool];
  return <Tool />;
}
