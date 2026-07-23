const colors: Record<string, string> = {
  pending: "bg-slate-100 text-slate-600",
  sent: "bg-blue-100 text-blue-700",
  opened: "bg-purple-100 text-purple-700",
  clicked: "bg-indigo-100 text-indigo-700",
  replied: "bg-green-100 text-green-700",
  bounced: "bg-orange-100 text-orange-700",
  failed: "bg-red-100 text-red-700",
};

export function EmailStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] || colors.pending}`}
    >
      {status}
    </span>
  );
}
