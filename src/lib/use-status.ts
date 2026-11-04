"use client";

import { useCallback } from "react";
import { useT } from "./i18n";
import { STATUS_META, statusMeta } from "./status";

/** `statusMeta` with the label and short tag in the reader's language. */
export function useStatusMeta() {
  const t = useT();
  return useCallback(
    (s?: string) => {
      const key = s && STATUS_META[s] ? s : "CREATED";
      return { ...statusMeta(s), label: t(`common.status.${key}`), short: t(`common.statusShort.${key}`) };
    },
    [t],
  );
}
