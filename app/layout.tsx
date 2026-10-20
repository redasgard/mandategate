import type { Metadata } from "next";
import "./globals.css";
import "./operations-v2.css";

export const metadata: Metadata = {
  title: "MandateGate",
  description: "The firewall between AI agents and your money.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
