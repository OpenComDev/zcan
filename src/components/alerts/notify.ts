"use client";

import { useSyncExternalStore } from "react";

export type NotifyPermission = NotificationPermission | "unsupported";

const EVENT = "zcan:notify-permission";
const supported = () => typeof window !== "undefined" && "Notification" in window;
const read = (): NotifyPermission => (supported() ? Notification.permission : "unsupported");

function subscribe(cb: () => void) {
  let status: PermissionStatus | null = null;
  let gone = false;
  window.addEventListener(EVENT, cb);
  navigator.permissions
    ?.query({ name: "notifications" as PermissionName })
    .then((s) => {
      if (gone) return;
      status = s;
      s.addEventListener("change", cb);
    })
    .catch(() => {});
  return () => {
    gone = true;
    window.removeEventListener(EVENT, cb);
    status?.removeEventListener("change", cb);
  };
}

/** Browser notification permission; "unsupported" on the server and where the API is missing. */
export function useNotificationPermission(): NotifyPermission {
  return useSyncExternalStore(subscribe, read, () => "unsupported");
}

/** Ask for notification permission. Call only from a user click; asks at most once. */
export async function requestNotifications(): Promise<NotifyPermission> {
  if (!supported() || Notification.permission !== "default") return read();
  try {
    await Notification.requestPermission();
  } catch {
    // Older Safari or a blocked prompt — fall back to in-app toasts.
  }
  window.dispatchEvent(new Event(EVENT));
  return read();
}

/** Show a system notification. Returns false when it couldn't be shown. */
export function notify(title: string, body: string, tag: string): boolean {
  if (!supported() || Notification.permission !== "granted") return false;
  try {
    const n = new Notification(title, { body, tag, icon: "/icon.png" });
    n.onclick = () => {
      window.focus();
      n.close();
    };
    return true;
  } catch {
    // Some mobile browsers only allow notifications from a service worker.
    return false;
  }
}
