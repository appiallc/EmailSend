// Gmail and other providers often auto-fetch tracking pixels within seconds of delivery.
// Opens sooner than this after sentAt are ignored as prefetch noise.
export const MIN_OPEN_DELAY_MS = 60_000;

export function shouldCountOpen(sentAt: Date | null, now: Date = new Date()): boolean {
  if (!sentAt) return true;
  return now.getTime() - sentAt.getTime() >= MIN_OPEN_DELAY_MS;
}
