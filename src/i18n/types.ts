export type LocaleCode = "en" | "es" | "pt" | "tr" | "ru" | "zh";
/** One namespace: locale → key → text. Use {name} placeholders for variables. */
export type Messages = Record<LocaleCode, Record<string, string>>;
