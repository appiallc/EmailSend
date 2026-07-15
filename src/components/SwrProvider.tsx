"use client";

import { SWRConfig } from "swr";
import { swrFetcher } from "@/lib/swr";

export function SwrProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        fetcher: swrFetcher,
        revalidateOnFocus: false,
        revalidateOnReconnect: true,
        dedupingInterval: 5_000,
      }}
    >
      {children}
    </SWRConfig>
  );
}
