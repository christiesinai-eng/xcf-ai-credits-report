import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "XCF · AI Credits & Tools Report",
  description: "AI tool usage and credit tracking across XCF projects",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
