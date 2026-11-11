/**
 * Automatic extraction schedule: once a day at a time chosen in Manila time (`timeZone`, normally Asia/Manila). Pure,
 * so it can be tested; the cron route claims the day's run in SQL with the same rule as isDue.
 */

export interface AutoSchedule {
  enabled: boolean;
  /** "HH:MM" in `timeZone`. */
  time: string;
  /** "YYYY-MM-DD" (in `timeZone`) of the day already claimed, or null. */
  lastRunOn: string | null;
}

/** Date ("YYYY-MM-DD") and time ("HH:MM") of `now` in `timeZone`. */
export function zonedClock(now: Date, timeZone: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

/** True when the day's run should start now: switched on, the time has come, and today was not claimed yet. */
export function isDue(s: AutoSchedule, now: Date, timeZone: string): boolean {
  const c = zonedClock(now, timeZone);
  return s.enabled && c.time >= s.time && (s.lastRunOn === null || s.lastRunOn < c.date);
}

const addDays = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** The instant at wall-clock `date` `time` in `timeZone`. */
function zonedInstant(date: string, time: string, timeZone: string): Date {
  const guess = new Date(`${date}T${time}:00Z`);
  // Offset of the zone at that moment (Manila: +8 h all year), applied to the wall-clock time read as UTC.
  const c = zonedClock(guess, timeZone);
  const asUtc = new Date(`${c.date}T${c.time}:00Z`).getTime();
  return new Date(guess.getTime() - (asUtc - guess.getTime()));
}

/** When the next automatic run starts (the scheduler calls every 15 minutes, so up to 15 minutes later), or null when off. */
export function nextRunAt(s: AutoSchedule, now: Date, timeZone: string): Date | null {
  if (!s.enabled) return null;
  const c = zonedClock(now, timeZone);
  if (isDue(s, now, timeZone)) return now;
  const day = s.lastRunOn !== null && s.lastRunOn >= c.date ? addDays(c.date, 1) : c.time < s.time ? c.date : addDays(c.date, 1);
  return zonedInstant(day, s.time, timeZone);
}

/**
 * `lastRunOn` to store when an admin saves the schedule. A run that already happened today counts; otherwise a time
 * that has already passed today starts tomorrow (no surprise run right after saving), and a later time runs today.
 */
export function lastRunOnAfterSave(time: string, lastRunAt: Date | null, now: Date, timeZone: string): string | null {
  const c = zonedClock(now, timeZone);
  if (lastRunAt && zonedClock(lastRunAt, timeZone).date === c.date) return c.date;
  return time <= c.time ? c.date : null;
}
