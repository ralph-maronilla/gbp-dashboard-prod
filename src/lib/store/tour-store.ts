"use client";

import { create } from "zustand";

/** The guided tour (components/tour): whether it is running and on which step. Not persisted. */
interface TourState {
  running: boolean;
  step: number;
  /** data-tour id of the element the current step points at. */
  target: string | null;
  setTarget: (target: string | null) => void;
  start: () => void;
  go: (step: number) => void;
  stop: () => void;
}

export const useTourStore = create<TourState>((set) => ({
  running: false,
  step: 0,
  target: null,
  setTarget: (target) => set({ target }),
  start: () => set({ running: true, step: 0 }),
  go: (step) => set({ step }),
  stop: () => set({ running: false, step: 0, target: null }),
}));
