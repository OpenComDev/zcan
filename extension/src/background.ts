/**
 * Zcan extension background: context-menu "Copy clean link", and the in-memory record of the last crypto
 * address copied (chrome.storage.session — never written to disk, cleared when the browser closes).
 * Makes no network requests.
 */
import { cleanLink } from "../../src/lib/link-clean";

const t = (key: string) => chrome.i18n.getMessage(key) || key;

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: "copy-clean-link", title: t("menuCopyClean"), contexts: ["link"] });
  chrome.contextMenus.create({ id: "copy-clean-page", title: t("menuCopyPageClean"), contexts: ["page"] });
});

function clean(url: string): string {
  try {
    return cleanLink(url).cleaned;
  } catch {
    return url;
  }
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const url = info.menuItemId === "copy-clean-link" ? info.linkUrl : info.pageUrl;
  if (!url || !tab?.id) return;
  const text = clean(url);
  // The clipboard is written in the page (the menu click counts as the user's gesture there).
  await chrome.scripting
    .executeScript({ target: { tabId: tab.id, frameIds: info.frameId != null ? [info.frameId] : undefined }, func: (v: string) => navigator.clipboard.writeText(v), args: [text] })
    .catch(() => {});
});

type Msg = { type: "copied-address"; address: string } | { type: "last-copied" };

chrome.runtime.onMessage.addListener((msg: Msg, _sender, reply) => {
  if (msg.type === "copied-address") {
    void chrome.storage.session.set({ copied: { address: msg.address.slice(0, 260), at: Date.now() } });
    return false;
  }
  if (msg.type === "last-copied") {
    chrome.storage.session.get("copied").then((v) => reply(v.copied ?? null));
    return true; // async reply
  }
  return false;
});
