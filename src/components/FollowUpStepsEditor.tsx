"use client";

import {
  DEFAULT_FOLLOWUP_BODY,
  DEFAULT_FOLLOWUP_SUBJECT,
} from "@/lib/templates";
import {
  createEmptyExtraFollowUp,
  type FollowUpStep,
} from "@/lib/follow-ups";
import { EmailPreview } from "@/components/EmailPreview";
import { HtmlEmailEditor } from "@/components/HtmlEmailEditor";
import { scoreEmailContent } from "@/lib/send-preflight";

function followUpLabel(index: number) {
  return index === 0 ? "Follow-up 1 (default)" : `Follow-up ${index + 1}`;
}

export function FollowUpStepsEditor({
  followUpDays,
  followUpTimeOfDay,
  followUpSubject,
  followUpBodyHtml,
  extraFollowUps,
  emailSignature,
  onChangeDefault,
  onChangeExtra,
}: {
  followUpDays: number;
  followUpTimeOfDay: string;
  followUpSubject: string;
  followUpBodyHtml: string;
  extraFollowUps: FollowUpStep[];
  emailSignature?: string | null;
  onChangeDefault: (patch: {
    followUpDays?: number;
    followUpTimeOfDay?: string;
    followUpSubject?: string;
    followUpBodyHtml?: string;
  }) => void;
  onChangeExtra: (steps: FollowUpStep[]) => void;
}) {
  const minForExtra = (index: number) => {
    if (index === 0) return followUpDays;
    return extraFollowUps[index - 1]?.days ?? followUpDays;
  };

  const addFollowUp = () => {
    const lastDays =
      extraFollowUps.length > 0
        ? extraFollowUps[extraFollowUps.length - 1].days
        : followUpDays;
    const lastTime =
      extraFollowUps.length > 0
        ? extraFollowUps[extraFollowUps.length - 1].timeOfDay
        : followUpTimeOfDay;
    onChangeExtra([
      ...extraFollowUps,
      createEmptyExtraFollowUp(lastDays, lastTime),
    ]);
  };

  const updateExtra = (index: number, patch: Partial<FollowUpStep>) => {
    onChangeExtra(
      extraFollowUps.map((step, i) => (i === index ? { ...step, ...patch } : step))
    );
  };

  const removeExtra = (index: number) => {
    onChangeExtra(extraFollowUps.filter((_, i) => i !== index));
  };

  const defaultScore = scoreEmailContent(followUpSubject, followUpBodyHtml);

  return (
    <div className="border-t pt-4 space-y-4">
      <div>
        <h3 className="font-medium text-sm mb-1">Follow-ups (sent after no reply)</h3>
        <p className="text-xs text-slate-400">
          Days are counted from the initial send. Each step runs at the time you set
          (operator timezone). Later steps must be on the same or a later day.
          Follow-ups send as <code className="text-[11px]">Re: {"{initial subject}"}</code> so
          they stay in the same Gmail thread — the subject fields below are for your draft notes
          only and are not used as the outbound Subject header.
        </p>
      </div>

      <div className="rounded-lg border border-slate-200 p-4 space-y-3 bg-slate-50/50">
        <p className="text-xs font-medium text-slate-600">{followUpLabel(0)}</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Days after initial send</label>
            <input
              type="number"
              min={0}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
              value={followUpDays}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10);
                onChangeDefault({
                  followUpDays: Number.isFinite(n) && n >= 0 ? n : 0,
                });
              }}
            />
            <p className="text-xs text-slate-400 mt-1">Use 0 to test (due same day at the time below).</p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Send time</label>
            <input
              type="time"
              className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
              value={followUpTimeOfDay}
              onChange={(e) => onChangeDefault({ followUpTimeOfDay: e.target.value })}
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Subject</label>
          <input
            className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
            value={followUpSubject}
            onChange={(e) => onChangeDefault({ followUpSubject: e.target.value })}
          />
          {defaultScore.flags.length > 0 && (
            <p className="text-xs text-amber-700 mt-1">
              Content {defaultScore.score}/100 — {defaultScore.flags[0]}
            </p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Body (HTML)</label>
          <HtmlEmailEditor
            rows={7}
            value={followUpBodyHtml}
            onChange={(html) => onChangeDefault({ followUpBodyHtml: html })}
          />
          <EmailPreview
            label={`${followUpLabel(0)} preview`}
            subject={followUpSubject}
            bodyHtml={followUpBodyHtml}
            signature={emailSignature}
          />
        </div>
      </div>

      {extraFollowUps.map((step, index) => (
        <div
          key={index}
          className="rounded-lg border border-slate-200 p-4 space-y-3 bg-white"
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-slate-600">{followUpLabel(index + 1)}</p>
            <button
              type="button"
              onClick={() => removeExtra(index)}
              className="text-xs text-red-600 hover:underline"
            >
              Remove
            </button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Days after initial send</label>
              <input
                type="number"
                min={minForExtra(index)}
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={step.days}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10);
                  updateExtra(index, {
                    days: Number.isFinite(n) ? n : minForExtra(index),
                  });
                }}
              />
              <p className="text-xs text-slate-400 mt-1">Min {minForExtra(index)} days</p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Send time</label>
              <input
                type="time"
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={step.timeOfDay || "10:00"}
                onChange={(e) => updateExtra(index, { timeOfDay: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Subject</label>
            <input
              className="w-full border rounded-lg px-3 py-2 text-sm"
              value={step.subject}
              onChange={(e) => updateExtra(index, { subject: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Body (HTML)</label>
            <HtmlEmailEditor
              rows={7}
              value={step.bodyHtml}
              onChange={(html) => updateExtra(index, { bodyHtml: html })}
            />
            <EmailPreview
              label={`${followUpLabel(index + 1)} preview`}
              subject={step.subject}
              bodyHtml={step.bodyHtml}
              signature={emailSignature}
            />
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={addFollowUp}
        className="px-3 py-2 text-sm border border-dashed border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 hover:border-slate-400"
      >
        + Add follow-up
      </button>
    </div>
  );
}

export { DEFAULT_FOLLOWUP_SUBJECT, DEFAULT_FOLLOWUP_BODY };
