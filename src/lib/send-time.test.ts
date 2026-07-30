import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeFollowUpDueAt,
  findFollowUpsBeforeInitial,
  getRiskySendReasons,
  isWeekendParts,
  getZonedParts,
  parseTimeOfDay,
  snapToSendWindow,
} from "./send-time.ts";

describe("send-time", () => {
  it("parses time of day", () => {
    assert.equal(parseTimeOfDay("9:30"), "09:30");
    assert.equal(parseTimeOfDay("bad", "10:00"), "10:00");
  });

  it("flags weekend risk", () => {
    const sat = new Date("2026-08-01T12:00:00+05:30");
    const reasons = getRiskySendReasons(sat, {
      timezone: "Asia/Kolkata",
      sendWindowStart: "09:00",
      sendWindowEnd: "17:00",
    });
    assert.ok(reasons.includes("weekend"));
  });

  it("snaps weekend to weekday window", () => {
    const sat = new Date("2026-08-01T12:00:00+05:30");
    const snapped = snapToSendWindow(sat, {
      timezone: "Asia/Kolkata",
      businessDaysOnly: true,
      sendWindowStart: "09:00",
      sendWindowEnd: "17:00",
    });
    const parts = getZonedParts(snapped, "Asia/Kolkata");
    assert.equal(isWeekendParts(parts), false);
  });

  it("computes follow-up at time of day", () => {
    const sentAt = new Date("2026-07-28T08:15:00+05:30");
    const due = computeFollowUpDueAt({
      sentAt,
      days: 1,
      timeOfDay: "10:30",
      settings: {
        timezone: "Asia/Kolkata",
        businessDaysOnly: true,
        sendWindowStart: "09:00",
        sendWindowEnd: "17:00",
      },
      now: new Date("2026-07-28T08:00:00+05:30"),
    });
    const parts = getZonedParts(due, "Asia/Kolkata");
    assert.equal(parts.day, 29);
    assert.equal(parts.hour, 10);
    assert.equal(parts.minute, 30);
  });

  it("flags follow-ups before initial send", () => {
    const initialAt = new Date("2026-07-30T17:00:00+05:30");
    const conflicts = findFollowUpsBeforeInitial({
      initialAt,
      timezone: "Asia/Kolkata",
      steps: [
        { days: 0, timeOfDay: "16:10" },
        { days: 0, timeOfDay: "16:20" },
        { days: 0, timeOfDay: "17:30" },
      ],
    });
    assert.equal(conflicts.length, 2);
    assert.equal(conflicts[0].stepIndex, 1);
    assert.equal(conflicts[1].stepIndex, 2);
  });
});
