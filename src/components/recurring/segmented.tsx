"use client";

import { useT } from "@/lib/i18n";
import { EVERY, type Every } from "@/lib/recurring";

/** Radio group drawn as a hairline segmented control. */
export function Segmented<T extends string>({
  legend,
  name,
  value,
  onChange,
  options,
  cols = 2,
}: {
  legend: string;
  name: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; disabled?: boolean }[];
  cols?: 2 | 4;
}) {
  return (
    <fieldset className="mt-4 min-w-0 first:mt-0">
      <legend className="label mb-2">{legend}</legend>
      <div className={`grid border border-line ${cols === 4 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2"}`}>
        {options.map((o, i) => (
          <label
            key={o.value}
            className={`flex min-h-10 min-w-0 items-center justify-center px-2 py-1.5 text-center text-[12px] uppercase leading-tight tracking-wider transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-1 has-[:focus-visible]:-outline-offset-1 has-[:focus-visible]:outline-accent ${
              i > 0 ? (cols === 4 ? "border-line max-sm:even:border-l max-sm:nth-[n+3]:border-t sm:border-l" : "border-l border-line") : ""
            } ${o.disabled ? "cursor-not-allowed text-subtle" : "cursor-pointer"} ${value === o.value ? "bg-accent/15 text-text" : o.disabled ? "" : "text-muted hover:text-text"}`}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              disabled={o.disabled}
              onChange={() => onChange(o.value)}
              className="sr-only"
            />
            <span className="min-w-0 break-words">{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Day / week / 2 weeks / month. */
export function EverySegmented({ value, onChange, name = "every" }: { value: Every; onChange: (v: Every) => void; name?: string }) {
  const t = useT();
  return (
    <Segmented
      legend={t("recurring.form.every")}
      name={name}
      value={value}
      onChange={onChange}
      cols={4}
      options={EVERY.map((e) => ({ value: e, label: t(`recurring.short.${e}`) }))}
    />
  );
}
