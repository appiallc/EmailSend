import { alertToneClasses, toneFromMessage, type AlertTone } from "@/lib/alert-tone";

export function AlertBanner({
  message,
  tone,
}: {
  message: string;
  tone?: AlertTone;
}) {
  const resolved = tone ?? toneFromMessage(message);

  return (
    <div
      className={`mb-4 rounded-lg border px-4 py-3 text-sm ${alertToneClasses(resolved)}`}
    >
      {message}
    </div>
  );
}
