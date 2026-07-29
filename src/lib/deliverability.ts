/** Max soft-bounce automatic retries before treating as final. */
export const SOFT_BOUNCE_MAX_RETRIES = 3;

/** Delay before each retry attempt (1h, 6h, 24h). */
export const SOFT_BOUNCE_RETRY_DELAYS_MS = [
  60 * 60 * 1000,
  6 * 60 * 60 * 1000,
  24 * 60 * 60 * 1000,
] as const;

export function nextSoftBounceRetryAt(
  retryCount: number,
  from: Date = new Date()
): Date | null {
  if (retryCount >= SOFT_BOUNCE_MAX_RETRIES) return null;
  const delay =
    SOFT_BOUNCE_RETRY_DELAYS_MS[
      Math.min(retryCount, SOFT_BOUNCE_RETRY_DELAYS_MS.length - 1)
    ];
  return new Date(from.getTime() + delay);
}

export function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Clamp Settings.sendDelayMs to a sane range. */
export function normalizeSendDelayMs(value: unknown, fallback = 500): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(Math.floor(n), 60_000);
}
