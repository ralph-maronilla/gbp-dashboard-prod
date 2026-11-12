import { z } from "zod";

/** "HH:MM", 15-minute steps (the scheduler calls every 15 minutes). */
export const AUTO_TIME = /^([01][0-9]|2[0-3]):(00|15|30|45)$/;

export const autoExtractSchema = z.object({
  enabled: z.boolean(),
  time: z.string().regex(AUTO_TIME, "Choose a time in 15-minute steps, e.g. 06:00 or 06:15"),
  credit_limit: z.number().int().min(0).max(5000),
});
export type AutoExtractInput = z.output<typeof autoExtractSchema>;

export interface AutoExtractStatus {
  enabled: boolean;
  time: string;
  credit_limit: number;
  /** IANA zone the time is in (Asia/Manila). */
  time_zone: string;
  next_run_at: string | null;
  /** The time has come and today's run has not started yet: it starts at the next scheduler call. */
  due: boolean;
  scheduler_last_tick_at: string | null;
  /** The scheduler called within the last 30 minutes. */
  scheduler_connected: boolean;
  /** The most recent automatic day: its runs (the first and the follow-ups for big extractions) together. */
  last_run: {
    started_at: string;
    finished_at: string | null;
    runs: number;
    credits_used: number;
    reviews_upserted: number;
    status: string;
    error: string | null;
  } | null;
}

/** What every user sees of automatic extraction: on or off and its time ("HH:MM" in `time_zone`). */
export interface AutoExtractSchedule {
  enabled: boolean;
  time: string | null;
  time_zone: string;
}
