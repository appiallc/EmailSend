/** Public pages (login, unsubscribe) — no CRM sidebar or chrome. */
export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="h-full w-full min-h-0 overflow-auto bg-slate-100">
      {children}
    </div>
  );
}
