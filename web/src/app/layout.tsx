import "./globals.css";
import type { ReactNode } from "react";
import { Providers } from "@/components/Providers";

export const metadata = {
  title: "Trip Planner",
  description: "AI-assisted mountain travel planner for Indian highways"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

