export function Loader({
  label,
  fullPage = false,
}: {
  label?: string;
  fullPage?: boolean;
}) {
  return (
    <div
      className={
        fullPage
          ? "flex min-h-[60vh] items-center justify-center"
          : "flex items-center justify-center p-12"
      }
    >
      <div className="flex flex-col items-center gap-3">
        <div
          className="h-9 w-9 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600"
          role="status"
          aria-label={label ?? "Loading"}
        />
        {label && <p className="text-sm text-slate-500">{label}</p>}
      </div>
    </div>
  );
}
