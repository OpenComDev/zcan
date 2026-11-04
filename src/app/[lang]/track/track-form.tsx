"use client";

import { useRouter } from "next/navigation";
import { LoaderCircle, Search } from "lucide-react";
import { useState } from "react";
import { useLocalePath, useT } from "@/lib/i18n";

export function TrackForm() {
  const router = useRouter();
  const lp = useLocalePath();
  const t = useT();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const id = value.trim();
    if (!id) {
      setError(t("order.track.err"));
      return;
    }
    setPending(true);
    router.push(lp(`/order/${encodeURIComponent(id)}`));
  };

  return (
    <form onSubmit={submit} noValidate>
      <label htmlFor="order-id" className="mb-2 block text-[12px] font-medium uppercase tracking-wider text-muted">
        {t("order.track.label")}
      </label>
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          id="order-id"
          name="order-id"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          placeholder={t("order.track.placeholder")}
          autoComplete="off"
          spellCheck={false}
          autoCapitalize="off"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "order-id-err" : undefined}
          className={`h-12 min-w-0 flex-1 border bg-bg-2 px-3 text-base text-fg outline-none placeholder:text-[13px] placeholder:text-subtle focus:border-accent/70 ${
            error ? "border-red" : "border-line"
          }`}
        />
        <button
          type="submit"
          disabled={pending}
          className="btn-accent inline-flex h-12 items-center justify-center gap-2 px-5 text-[12px] disabled:opacity-80"
        >
          {pending ? <LoaderCircle size={18} className="animate-spin-slow" aria-hidden /> : <Search size={18} aria-hidden />}
          {t("order.track.submit")}
        </button>
      </div>
      {error && (
        <p id="order-id-err" role="alert" className="mt-2 text-[13px] text-red">
          {error}
        </p>
      )}
    </form>
  );
}
