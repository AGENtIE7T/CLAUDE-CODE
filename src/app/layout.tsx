import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AEO Autopilot",
  description:
    "Auto-generate, publish, and measure the content that gets your brand cited by AI answer engines.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
