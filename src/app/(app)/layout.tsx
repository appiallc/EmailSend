import { Sidebar } from "@/components/Sidebar";

/** Authenticated CRM shell — sidebar + main. Not used for public pages. */
export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full overflow-hidden">
      <Sidebar />
      <main className="flex-1 min-h-0 overflow-auto">{children}</main>
    </div>
  );
}
