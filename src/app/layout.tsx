import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Reset90",
  description: "Private 90-day reset command center",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
