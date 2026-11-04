"use client";

import { ErrorScreen } from "@/components/shell/error-screen";

export default function Error(props: { error: Error & { digest?: string }; retry: () => void }) {
  return <ErrorScreen {...props} />;
}
