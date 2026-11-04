export type Settings = { cleanOnCopy: boolean; guard: boolean; toast: boolean };
export const DEFAULTS: Settings = { cleanOnCopy: true, guard: true, toast: true };

export async function getSettings(): Promise<Settings> {
  const s = (await chrome.storage.local.get("settings")).settings as Partial<Settings> | undefined;
  return { ...DEFAULTS, ...s };
}

export async function setSettings(patch: Partial<Settings>) {
  await chrome.storage.local.set({ settings: { ...(await getSettings()), ...patch } });
}
