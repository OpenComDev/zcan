"use client";

import { useEffect, useSyncExternalStore } from "react";

export type ResourceState<T> = { data: T | null; error: string | null; loading: boolean };

/**
 * A tiny shared, self-refreshing remote resource. Built on useSyncExternalStore so that
 * hydration always renders the server snapshot (empty) even if another component already
 * filled the cache — avoiding hydration mismatches.
 */
export function createResource<T>(load: () => Promise<T>, ttl: number) {
  const SERVER: ResourceState<T> = { data: null, error: null, loading: true };
  let state: ResourceState<T> = SERVER;
  let fetchedAt = 0;
  let inflight: Promise<void> | null = null;
  let users = 0;
  let timer: ReturnType<typeof setInterval> | null = null;
  const listeners = new Set<() => void>();

  const set = (next: ResourceState<T>) => {
    state = next;
    listeners.forEach((l) => l());
  };

  const refresh = (force = false) => {
    if (!force && state.data && Date.now() - fetchedAt < ttl) return;
    inflight ??= load()
      .then(
        (data) => {
          fetchedAt = Date.now();
          set({ data, error: null, loading: false });
        },
        (e: Error) => set({ ...state, error: e.message || "Unavailable", loading: false }),
      )
      .finally(() => {
        inflight = null;
      });
  };

  const subscribe = (cb: () => void) => {
    listeners.add(cb);
    return () => listeners.delete(cb);
  };

  function use(): ResourceState<T> & { retry: () => void } {
    const s = useSyncExternalStore(subscribe, () => state, () => SERVER);
    useEffect(() => {
      users += 1;
      refresh();
      timer ??= setInterval(() => refresh(true), ttl);
      return () => {
        users -= 1;
        if (users === 0 && timer) {
          clearInterval(timer);
          timer = null;
        }
      };
    }, []);
    return {
      ...s,
      retry: () => {
        set({ ...state, error: null, loading: true });
        refresh(true);
      },
    };
  }

  return { use };
}
