export type AlertTone = "success" | "warning" | "error";

const toneClasses: Record<AlertTone, string> = {
  success: "border-green-200 bg-green-50 text-green-800",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  error: "border-red-200 bg-red-50 text-red-800",
};

export function toneFromMessage(message: string): AlertTone {
  const lower = message.toLowerCase();
  if (lower.startsWith("error:") || lower.startsWith("error ")) return "error";
  if (/\bsent 0 email/.test(lower) && /\bfailed\b/.test(lower)) return "error";
  if (/\bfailed\b/.test(lower) || lower.includes("issues:")) return "warning";
  if (
    lower.includes("success") ||
    lower.includes("scheduled") ||
    lower.includes("saved") ||
    lower.includes("deleted") ||
    lower.includes("created") ||
    lower.includes("sent")
  ) {
    return "success";
  }
  return "success";
}

export function alertToneClasses(tone: AlertTone): string {
  return toneClasses[tone];
}
