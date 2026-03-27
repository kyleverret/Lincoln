import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Lincoln — Law Firm Case Management",
    template: "%s | Lincoln",
  },
  description: "Secure case management platform for law firms",
  robots: { index: false, follow: false }, // Private application
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
