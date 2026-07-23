// Gmail and other providers often auto-fetch tracking pixels within seconds of delivery.
// Opens sooner than this after sentAt are ignored as prefetch noise.
// In development, we disable this delay to allow instant test verification.
export const MIN_OPEN_DELAY_MS = process.env.NODE_ENV === "production" ? 5_000 : 0;

export function shouldCountOpen(sentAt: Date | null, now: Date = new Date()): boolean {
  if (!sentAt) return true;
  return now.getTime() - sentAt.getTime() >= MIN_OPEN_DELAY_MS;
}
