import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NGS Mini Galaxy",
  description: "Webowa platforma do analiz bioinformatycznych i orkiestracji potoków NGS.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pl" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
