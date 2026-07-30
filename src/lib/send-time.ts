/** Timezone-aware schedule helpers for deliverability windows. */

export const DEFAULT_TIMEZONE = "Asia/Kolkata";
export const DEFAULT_FOLLOWUP_TIME = "10:00";
export const DEFAULT_WINDOW_START = "09:00";
export const DEFAULT_WINDOW_END = "17:00";

export type SendWindowSettings = {
  timezone?: string | null;
  businessDaysOnly?: boolean | null;
  sendWindowStart?: string | null;
  sendWindowEnd?: string | null;
};

export type TimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: string;
};

const WEEKDAY_TO_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export function parseTimeOfDay(value: unknown, fallback = DEFAULT_FOLLOWUP_TIME): string {
  const raw = String(value ?? "").trim();
  const match = /^(\d{1,2}):(\d{2})$/.exec(raw);
  if (!match) return fallback;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return fallback;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return fallback;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function splitTimeOfDay(value: string): { hour: number; minute: number } {
  const parsed = parseTimeOfDay(value);
  const [h, m] = parsed.split(":").map(Number);
  return { hour: h, minute: m };
}

export function resolveTimezone(tz?: string | null): string {
  const candidate = (tz || DEFAULT_TIMEZONE).trim() || DEFAULT_TIMEZONE;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: candidate });
    return candidate;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

export function getZonedParts(date: Date, timeZone: string): TimeParts {
  const tz = resolveTimezone(timeZone);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  });
  const parts = fmt.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "0";

  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour") === "24" ? "0" : get("hour")),
    minute: Number(get("minute")),
    second: Number(get("second")),
    weekday: get("weekday"),
  };
}

/** Build a Date whose wall-clock in `timeZone` matches the given parts. */
export function zonedDateTimeToUtc(
  parts: {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second?: number;
  },
  timeZone: string
): Date {
  const tz = resolveTimezone(timeZone);
  const second = parts.second ?? 0;
  const utcGuess = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    second
  );

  let guess = utcGuess;
  for (let i = 0; i < 3; i++) {
    const asZoned = getZonedParts(new Date(guess), tz);
    const asUtc = Date.UTC(
      asZoned.year,
      asZoned.month - 1,
      asZoned.day,
      asZoned.hour,
      asZoned.minute,
      asZoned.second
    );
    const desired = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      second
    );
    const diff = desired - asUtc;
    guess += diff;
    if (diff === 0) break;
  }
  return new Date(guess);
}

function addCalendarDays(
  parts: TimeParts,
  days: number
): { year: number; month: number; day: number } {
  const dt = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return {
    year: dt.getUTCFullYear(),
    month: dt.getUTCMonth() + 1,
    day: dt.getUTCDate(),
  };
}

export function isWeekendParts(parts: Pick<TimeParts, "weekday">): boolean {
  const idx = WEEKDAY_TO_INDEX[parts.weekday];
  return idx === 0 || idx === 6;
}

export function minutesSinceMidnight(hour: number, minute: number): number {
  return hour * 60 + minute;
}

export function isWithinSendWindow(
  parts: TimeParts,
  windowStart: string,
  windowEnd: string
): boolean {
  const start = splitTimeOfDay(windowStart);
  const end = splitTimeOfDay(windowEnd);
  const nowMins = minutesSinceMidnight(parts.hour, parts.minute);
  const startMins = minutesSinceMidnight(start.hour, start.minute);
  const endMins = minutesSinceMidnight(end.hour, end.minute);
  if (endMins <= startMins) {
    // Degenerate window — treat as always open.
    return true;
  }
  return nowMins >= startMins && nowMins < endMins;
}

export type RiskySendReason = "weekend" | "outside_hours";

export function getRiskySendReasons(
  date: Date,
  settings: SendWindowSettings = {}
): RiskySendReason[] {
  const tz = resolveTimezone(settings.timezone);
  const parts = getZonedParts(date, tz);
  const reasons: RiskySendReason[] = [];
  if (isWeekendParts(parts)) reasons.push("weekend");
  const start = parseTimeOfDay(settings.sendWindowStart, DEFAULT_WINDOW_START);
  const end = parseTimeOfDay(settings.sendWindowEnd, DEFAULT_WINDOW_END);
  if (!isWithinSendWindow(parts, start, end)) reasons.push("outside_hours");
  return reasons;
}

export function formatRiskLabel(date: Date, timeZone?: string | null): string {
  const tz = resolveTimezone(timeZone);
  return new Intl.DateTimeFormat(undefined, {
    timeZone: tz,
    weekday: "long",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

/** Roll forward to the next allowed Mon–Fri window start (or leave as-is). */
export function snapToSendWindow(
  date: Date,
  settings: SendWindowSettings = {}
): Date {
  const tz = resolveTimezone(settings.timezone);
  const businessDaysOnly = settings.businessDaysOnly !== false;
  const start = parseTimeOfDay(settings.sendWindowStart, DEFAULT_WINDOW_START);
  const end = parseTimeOfDay(settings.sendWindowEnd, DEFAULT_WINDOW_END);
  const startParts = splitTimeOfDay(start);

  let cursor = new Date(date.getTime());
  for (let i = 0; i < 14; i++) {
    const parts = getZonedParts(cursor, tz);
    const weekend = isWeekendParts(parts);
    const inWindow = isWithinSendWindow(parts, start, end);

    if ((!businessDaysOnly || !weekend) && inWindow) {
      return cursor;
    }

    if ((!businessDaysOnly || !weekend) && !inWindow) {
      const nowMins = minutesSinceMidnight(parts.hour, parts.minute);
      const endMins = minutesSinceMidnight(
        splitTimeOfDay(end).hour,
        splitTimeOfDay(end).minute
      );
      if (nowMins < minutesSinceMidnight(startParts.hour, startParts.minute)) {
        return zonedDateTimeToUtc(
          {
            year: parts.year,
            month: parts.month,
            day: parts.day,
            hour: startParts.hour,
            minute: startParts.minute,
            second: 0,
          },
          tz
        );
      }
      if (nowMins >= endMins) {
        const next = addCalendarDays(parts, 1);
        cursor = zonedDateTimeToUtc(
          {
            year: next.year,
            month: next.month,
            day: next.day,
            hour: startParts.hour,
            minute: startParts.minute,
            second: 0,
          },
          tz
        );
        continue;
      }
    }

    // Weekend or still invalid — jump to next calendar day at window start.
    const next = addCalendarDays(parts, 1);
    cursor = zonedDateTimeToUtc(
      {
        year: next.year,
        month: next.month,
        day: next.day,
        hour: startParts.hour,
        minute: startParts.minute,
        second: 0,
      },
      tz
    );
  }
  return cursor;
}

/** Next Monday 10:00 in timezone (or tomorrow if already weekday morning — used by modal). */
export function nextMondayMorning(
  from: Date,
  timeZone?: string | null,
  timeOfDay = "10:00"
): Date {
  const tz = resolveTimezone(timeZone);
  const { hour, minute } = splitTimeOfDay(timeOfDay);
  const parts = getZonedParts(from, tz);
  const idx = WEEKDAY_TO_INDEX[parts.weekday] ?? 0;
  const daysUntilMonday = idx === 0 ? 1 : idx === 6 ? 2 : (8 - idx) % 7 || 7;
  const next = addCalendarDays(parts, daysUntilMonday);
  return zonedDateTimeToUtc(
    {
      year: next.year,
      month: next.month,
      day: next.day,
      hour,
      minute,
      second: 0,
    },
    tz
  );
}

/**
 * Due datetime = calendar day of (initialSentAt + days) at timeOfDay in timezone,
 * then optionally snapped into the business send window.
 */
export function computeFollowUpDueAt(opts: {
  sentAt: Date;
  days: number;
  timeOfDay?: string | null;
  settings?: SendWindowSettings;
  now?: Date;
}): Date {
  const tz = resolveTimezone(opts.settings?.timezone);
  const time = parseTimeOfDay(opts.timeOfDay, DEFAULT_FOLLOWUP_TIME);
  const { hour, minute } = splitTimeOfDay(time);
  const sentParts = getZonedParts(opts.sentAt, tz);
  const targetDay = addCalendarDays(sentParts, Math.max(0, Math.floor(opts.days)));

  let due = zonedDateTimeToUtc(
    {
      year: targetDay.year,
      month: targetDay.month,
      day: targetDay.day,
      hour,
      minute,
      second: 0,
    },
    tz
  );

  const now = opts.now ?? new Date();
  if (due.getTime() <= now.getTime()) {
    // Day-0 / already-past: push to next minute so scheduler can pick it up,
    // then snap into window if needed.
    due = new Date(now.getTime() + 60_000);
  }

  if (opts.settings?.businessDaysOnly !== false) {
    due = snapToSendWindow(due, opts.settings);
  } else if (opts.settings) {
    // Still respect hours if businessDaysOnly is off but window is set — only snap hours.
    const parts = getZonedParts(due, tz);
    if (!isWithinSendWindow(
      parts,
      parseTimeOfDay(opts.settings.sendWindowStart, DEFAULT_WINDOW_START),
      parseTimeOfDay(opts.settings.sendWindowEnd, DEFAULT_WINDOW_END)
    )) {
      due = snapToSendWindow(due, {
        ...opts.settings,
        businessDaysOnly: false,
      });
    }
  }

  return due;
}

/**
 * Projected follow-up wall time from an assumed initial send — no "already past" bump.
 * Used to validate schedule/send before the initial goes out.
 */
export function projectFollowUpDueRaw(opts: {
  initialAt: Date;
  days: number;
  timeOfDay?: string | null;
  timezone?: string | null;
}): Date {
  const tz = resolveTimezone(opts.timezone);
  const time = parseTimeOfDay(opts.timeOfDay, DEFAULT_FOLLOWUP_TIME);
  const { hour, minute } = splitTimeOfDay(time);
  const sentParts = getZonedParts(opts.initialAt, tz);
  const targetDay = addCalendarDays(
    sentParts,
    Math.max(0, Math.floor(opts.days))
  );
  return zonedDateTimeToUtc(
    {
      year: targetDay.year,
      month: targetDay.month,
      day: targetDay.day,
      hour,
      minute,
      second: 0,
    },
    tz
  );
}

export type FollowUpTimingConflict = {
  stepIndex: number; // 1-based
  days: number;
  timeOfDay: string;
  projectedDue: Date;
};

/** Steps whose clock time would be at/before the initial send (would fire immediately after). */
export function findFollowUpsBeforeInitial(opts: {
  initialAt: Date;
  steps: { days: number; timeOfDay?: string | null }[];
  timezone?: string | null;
}): FollowUpTimingConflict[] {
  const conflicts: FollowUpTimingConflict[] = [];
  for (let i = 0; i < opts.steps.length; i++) {
    const step = opts.steps[i];
    const projectedDue = projectFollowUpDueRaw({
      initialAt: opts.initialAt,
      days: step.days,
      timeOfDay: step.timeOfDay,
      timezone: opts.timezone,
    });
    if (projectedDue.getTime() <= opts.initialAt.getTime()) {
      conflicts.push({
        stepIndex: i + 1,
        days: step.days,
        timeOfDay: parseTimeOfDay(step.timeOfDay, DEFAULT_FOLLOWUP_TIME),
        projectedDue,
      });
    }
  }
  return conflicts;
}

/** True if `now` is inside the configured send window (and weekday if required). */
export function isSendAllowedNow(
  now: Date,
  settings: SendWindowSettings = {}
): boolean {
  const tz = resolveTimezone(settings.timezone);
  const parts = getZonedParts(now, tz);
  if (settings.businessDaysOnly !== false && isWeekendParts(parts)) {
    return false;
  }
  return isWithinSendWindow(
    parts,
    parseTimeOfDay(settings.sendWindowStart, DEFAULT_WINDOW_START),
    parseTimeOfDay(settings.sendWindowEnd, DEFAULT_WINDOW_END)
  );
}

/** Start/end of "today" in timezone as UTC Date bounds. */
export function getTimezoneDayBounds(
  now: Date,
  timeZone?: string | null
): { start: Date; end: Date } {
  const tz = resolveTimezone(timeZone);
  const parts = getZonedParts(now, tz);
  const start = zonedDateTimeToUtc(
    {
      year: parts.year,
      month: parts.month,
      day: parts.day,
      hour: 0,
      minute: 0,
      second: 0,
    },
    tz
  );
  const next = addCalendarDays(parts, 1);
  const end = zonedDateTimeToUtc(
    {
      year: next.year,
      month: next.month,
      day: next.day,
      hour: 0,
      minute: 0,
      second: 0,
    },
    tz
  );
  return { start, end };
}
