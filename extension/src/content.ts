/**
 * Runs on every page, entirely locally:
 * - On copy: if the selection is a link with trackers, the clipboard gets the clean link instead.
 *   If it's a crypto address, it's remembered (in memory, via the background) for the paste check.
 * - On paste: if a crypto address is pasted that isn't the one last copied in this browser, a warning
 *   appears. The paste itself is never blocked or changed.
 * Nothing is sent over the network.
 */
import { cleanLink } from "../../src/lib/link-clean";
import { isLookalike, looksLikeAddress } from "./addresses";
import { getSettings, type Settings } from "./settings";

/** A paste is compared with copies made in the last 30 minutes. */
const WINDOW_MS = 30 * 60 * 1000;
const t = (key: string, subs?: string | string[]) => chrome.i18n.getMessage(key, subs) || key;

let settings: Settings | null = null;
const load = () => getSettings().then((s) => (settings = s));
void load();
chrome.storage.onChanged.addListener((c) => c.settings && void load());

const isLink = (s: string) => /^https?:\/\/\S+$/i.test(s);

document.addEventListener(
  "copy",
  (e) => {
    const text = (window.getSelection()?.toString() ?? "").trim();
    if (!text || !settings || !e.clipboardData) return;
    if (settings.guard && looksLikeAddress(text)) {
      void chrome.runtime.sendMessage({ type: "copied-address", address: text });
      return;
    }
    if (settings.cleanOnCopy && isLink(text)) {
      let r;
      try {
        r = cleanLink(text);
      } catch {
        return;
      }
      if (!r.removed.length) return;
      e.clipboardData.setData("text/plain", r.cleaned);
      e.preventDefault();
      if (settings.toast) toast(t("toastRemoved", String(r.trackers.length)));
    }
  },
  true,
);

document.addEventListener(
  "paste",
  (e) => {
    if (!settings?.guard) return;
    const pasted = e.clipboardData?.getData("text/plain").trim() ?? "";
    if (!looksLikeAddress(pasted)) return;
    void chrome.runtime.sendMessage({ type: "last-copied" }).then((last: { address: string; at: number } | null) => {
      if (!last || Date.now() - last.at > WINDOW_MS || last.address === pasted) return;
      warn(last.address, pasted);
    });
  },
  true,
);

// ---------- UI (shadow DOM, so pages can't restyle or read it easily) ----------

const CSS = `
:host{all:initial}
.box{position:fixed;z-index:2147483647;right:16px;bottom:16px;max-width:min(440px,calc(100vw - 32px));font:13px/1.45 ui-sans-serif,system-ui,sans-serif;color:#fff;background:#0b0b0c;border:1px solid #2a2a2e;box-shadow:0 8px 30px rgba(0,0,0,.45);padding:12px 14px}
.warn{border-color:#ff2d55}
.title{font-weight:600;margin:0 0 6px}
.warn .title{color:#ff5a77}
.row{margin:6px 0 0;word-break:break-all;font:12px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace}
.lbl{display:block;color:#9b9b9f;font:11px/1.4 ui-sans-serif,system-ui,sans-serif;text-transform:uppercase;letter-spacing:.06em}
.diff{color:#ff5a77;text-decoration:underline}
button{all:unset;cursor:pointer;margin-top:10px;padding:6px 10px;border:1px solid #3a3a3f;font:12px ui-sans-serif,system-ui,sans-serif;text-transform:uppercase;letter-spacing:.06em}
button:focus-visible{outline:2px solid #ff2d55;outline-offset:2px}
@media (prefers-reduced-motion:no-preference){.box{animation:in .18s ease-out}@keyframes in{from{opacity:0;transform:translateY(6px)}}}
`;

function mount(build: (root: HTMLElement) => void, ms?: number) {
  const host = document.createElement("zcan-guard");
  const shadow = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = CSS;
  const box = document.createElement("div");
  shadow.append(style, box);
  build(box);
  (document.body ?? document.documentElement).append(host);
  if (ms) setTimeout(() => host.remove(), ms);
  return host;
}

function toast(message: string) {
  mount((box) => {
    box.className = "box";
    box.setAttribute("role", "status");
    box.textContent = message;
  }, 2800);
}

/** Shows the copied and pasted addresses with the differing characters marked. */
function warn(copied: string, pasted: string) {
  const host = mount((box) => {
    box.className = "box warn";
    box.setAttribute("role", "alert");
    const title = document.createElement("p");
    title.className = "title";
    title.textContent = t("guardTitle");
    const body = document.createElement("p");
    body.textContent = isLookalike(copied, pasted) ? t("guardLookalike") : t("guardBody");
    box.append(title, body, line(t("guardCopied"), copied, pasted), line(t("guardPasted"), pasted, copied));
    const close = document.createElement("button");
    close.type = "button";
    close.textContent = t("guardDismiss");
    close.addEventListener("click", () => host.remove());
    box.append(close);
    setTimeout(() => close.focus(), 0);
  });
}

function line(label: string, value: string, other: string) {
  const p = document.createElement("p");
  p.className = "row";
  const l = document.createElement("span");
  l.className = "lbl";
  l.textContent = label;
  p.append(l);
  for (let i = 0; i < value.length; i++) {
    const ch = document.createElement("span");
    ch.textContent = value[i];
    if (value[i] !== other[i]) ch.className = "diff";
    p.append(ch);
  }
  return p;
}
