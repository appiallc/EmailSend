export const API = {
  stats: "/api/stats",
  settings: "/api/settings",
  settingsTestSmtp: "/api/settings/test-smtp",
  settingsTestImap: "/api/settings/test-imap",
  suppression: "/api/suppression",
  campaigns: "/api/campaigns",
  contactLists: "/api/contact-lists",
  templates: "/api/templates",
  contacts: (listId: string) => `/api/contacts?listId=${encodeURIComponent(listId)}`,
} as const;

export async function swrFetcher<T = unknown>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { error?: string }).error || `Request failed (${res.status})`
    );
  }
  return res.json() as Promise<T>;
}
