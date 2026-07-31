"use client";

import { SessionProvider } from "next-auth/react";
import { getNextAuthBasePath } from "@/lib/authUrl";

export function Providers({ children }: { children: React.ReactNode }) {
  return <SessionProvider basePath={getNextAuthBasePath()}>{children}</SessionProvider>;
}

