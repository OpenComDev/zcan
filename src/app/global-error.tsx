"use client";

import "./globals.css";
import { ErrorScreen } from "@/components/shell/error-screen";

/** Replaces the root layout when the layout itself crashes, so it renders its own document. */
export default function GlobalError(props: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en" data-theme="dark" style={{ colorScheme: "dark" }}>
      <body className="min-h-dvh antialiased">
        <title>Zcan</title>
        <ErrorScreen {...props} standalone />
      </body>
    </html>
  );
}
