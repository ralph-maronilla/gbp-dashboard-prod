"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useExtractSlice, useInvalidateAfterExtract } from "./hooks";

export interface ExtractionProgress {
  running: boolean;
  slices: number;
  reviewsSaved: number;
  creditsUsed: number;
  /** From the latest slice: locations covered / fully up to date / still in progress. */
  total: number;
  done: number;
  remaining: number;
  failed: number;
  message: string | null;
  error: string | null;
}

const IDLE: ExtractionProgress = {
  running: false, slices: 0, reviewsSaved: 0, creditsUsed: 0, total: 0, done: 0, remaining: 0, failed: 0, message: null, error: null,
};

/** Hard ceiling on passes in one run (each is up to 45 s), whatever else happens. */
const MAX_SLICES = 240;

/** Stops after this many passes in a row that finished nothing and saved nothing. */
const MAX_STALLED_SLICES = 2;

/** Waits while other runs hold the requested locations, before giving up. */
const BUSY_RETRIES = 12;
const BUSY_WAIT_MS = 5_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Drives an extraction from the browser: calls POST /api/extract (≤45 s each) until nothing remains, the user stops,
 * or a call fails. Data on the page refreshes after every slice.
 */
export function useExtractionRunner() {
  const slice = useExtractSlice();
  const invalidate = useInvalidateAfterExtract();
  const [progress, setProgress] = useState<ExtractionProgress>(IDLE);
  const stopRef = useRef(false);

  const start = useCallback(
    async (locationIds: string[] | undefined) => {
      stopRef.current = false;
      let acc: ExtractionProgress = { ...IDLE, running: true, message: "Starting…" };
      setProgress(acc);
      let busy = 0;
      let stalled = 0;
      try {
        for (let pass = 1; pass <= MAX_SLICES; pass++) {
          const s = await slice.mutateAsync({ location_ids: locationIds });
          const progressed = s.credits_used > 0 || s.processed > 0 || s.reviews_upserted > 0;
          acc = {
            ...acc,
            slices: acc.slices + 1,
            reviewsSaved: acc.reviewsSaved + s.reviews_upserted,
            creditsUsed: acc.creditsUsed + s.credits_used,
            total: s.locations_found,
            done: s.locations_found - s.remaining - s.failed,
            remaining: s.remaining,
            failed: s.failed,
            error: s.status === "failed" ? s.error : null,
          };
          void invalidate();
          if (s.status === "failed" || s.remaining === 0 || stopRef.current) break;
          // Credits are being spent but nothing is finishing or being saved: stop instead of burning credits.
          stalled = s.credits_used > 0 && s.processed === 0 && s.reviews_upserted === 0 ? stalled + 1 : 0;
          if (stalled >= MAX_STALLED_SLICES) {
            acc = { ...acc, error: "Extraction stopped: no progress after repeated passes. Credits used so far are shown above." };
            break;
          }
          if (!progressed) {
            // Everything left is being extracted by someone else right now: wait for them instead of failing.
            if (++busy > BUSY_RETRIES) {
              acc = { ...acc, message: "Other extractions are still working on these locations. They will finish on their own." };
              break;
            }
            acc = { ...acc, message: "Waiting for another extraction working on the same locations…" };
            setProgress(acc);
            await sleep(BUSY_WAIT_MS);
            continue;
          }
          busy = 0;
          acc = { ...acc, message: `Extracting… ${acc.remaining} location${acc.remaining === 1 ? "" : "s"} to go` };
          setProgress(acc);
        }
        acc = {
          ...acc,
          running: false,
          message: stopRef.current
            ? "Stopped. Progress is saved; extraction continues from here next time."
            : (acc.error ?? (acc.remaining === 0 ? "Extraction finished." : acc.message)),
        };
      } catch (err) {
        acc = { ...acc, running: false, message: null, error: err instanceof Error ? err.message : "Extraction failed" };
      }
      setProgress(acc);
      void invalidate();
    },
    [slice, invalidate],
  );

  // Leaving the page ends the loop: nothing keeps spending credits in the background of a page nobody is looking at.
  useEffect(() => {
    return () => {
      stopRef.current = true;
    };
  }, []);

  const stop = useCallback(() => {
    stopRef.current = true;
    setProgress((p) => ({ ...p, message: "Stopping after the current step…" }));
  }, []);

  return { progress, start, stop };
}
