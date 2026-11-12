"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * A per-browser preference (e.g. the CSV columns last chosen), kept in localStorage. The server render and the first
 * client render use null (no hydration mismatch); when storage is blocked (private mode) it lives in memory for this
 * tab only. Every component using the same key sees changes at once.
 */
const CHANGE = "stored-preference";
const memory = new Map<string, string>();

export function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key) ?? memory.get(key) ?? null;
  } catch {
    return memory.get(key) ?? null;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE, onChange);
  window.addEventListener("storage", onChange); // other tabs
  return () => {
    window.removeEventListener(CHANGE, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useStoredString(key: string): [string | null, (value: string) => void] {
  const value = useSyncExternalStore(subscribe, () => readStored(key), () => null);
  const set = useCallback((next: string) => writeStored(key, next), [key]);
  return [value, set];
}

export function writeStored(key: string, value: string) {
  memory.set(key, value);
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage blocked: kept in memory for this tab
  }
  window.dispatchEvent(new Event(CHANGE));
}
