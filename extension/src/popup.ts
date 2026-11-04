import { cleanLink } from "../../src/lib/link-clean";
import { getSettings, setSettings, type Settings } from "./settings";

const t = (key: string, subs?: string | string[]) => chrome.i18n.getMessage(key, subs) || key;
for (const el of document.querySelectorAll<HTMLElement>("[data-i18n]")) el.textContent = t(el.dataset.i18n!);
document.documentElement.lang = chrome.i18n.getUILanguage();

const KEYS: (keyof Settings)[] = ["cleanOnCopy", "guard", "toast"];
void getSettings().then((s) => {
  for (const k of KEYS) {
    const box = document.getElementById(k) as HTMLInputElement;
    box.checked = s[k];
    box.addEventListener("change", () => void setSettings({ [k]: box.checked }));
  }
});

const status = document.getElementById("copy-status")!;
document.getElementById("copy-page")!.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url || !/^https?:/.test(tab.url)) {
    status.textContent = t("popupNothing");
    return;
  }
  try {
    const r = cleanLink(tab.url);
    await navigator.clipboard.writeText(r.cleaned);
    status.textContent = r.trackers.length ? t("toastRemoved", String(r.trackers.length)) : t("popupCopied");
  } catch {
    status.textContent = t("popupNothing");
  }
});
