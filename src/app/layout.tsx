import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "sats-stacker — Bitcoin portfolio analyzer",
  description:
    "A dark-themed Bitcoin DCA portfolio analyzer. Cost basis, ROI and capital efficiency across multiple exchanges. Runs on synthetic demo data.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-night text-ink antialiased">{children}</body>
    </html>
  );
}
