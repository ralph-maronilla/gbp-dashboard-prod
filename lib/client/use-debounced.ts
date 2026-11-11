"use client";

import { useEffect, useRef, useState } from "react";

const DELAY_MS = 300;

/** `value` after it has stopped changing for a moment, so typing doesn't query on every keystroke. */
export function useDebounced<T>(value: T, ms = DELAY_MS): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return settled;
}

/**
 * Search box backed by a stored filter: it starts from the stored value (once `ready`, for filters restored from the
 * URL) and writes typing back through `commit` after a pause. Returns the box's text and its setter.
 */
export function useDebouncedField(stored: string, commit: (value: string) => void, ready = true): [string, (value: string) => void] {
  const [text, setText] = useState(stored);
  const [seeded, setSeeded] = useState(ready);
  const latest = useRef(commit);
  useEffect(() => {
    latest.current = commit;
  });
  if (ready && !seeded) {
    setSeeded(true);
    setText(stored);
  }
  useEffect(() => {
    if (!seeded || text === stored) return;
    const t = setTimeout(() => latest.current(text), DELAY_MS);
    return () => clearTimeout(t);
  }, [text, seeded, stored]);
  return [text, setText];
}
