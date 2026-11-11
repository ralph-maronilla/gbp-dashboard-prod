/** A failed call to Serper. */
export class SerperError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "SerperError";
  }

  /** Bad key or no credits left: every further request would fail too, so the run stops. */
  get isFatal() {
    return this.status === 401 || this.status === 402 || this.status === 403;
  }
}

/** Do not start a request with less time than this left in the run's budget. */
export const MIN_REQUEST_MS = 3_000;

/**
 * The run's time budget is used up: not a failure. Whatever was saved stays saved (with its cursor), and the next
 * run continues from there.
 */
export class SerperTimeBudgetError extends SerperError {
  constructor() {
    super(504, "Out of time for this run; it continues on the next one");
    this.name = "SerperTimeBudgetError";
  }
}
