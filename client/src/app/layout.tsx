import type { Metadata } from "next";
import { JetBrains_Mono, Inter } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";

const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

const sans = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ZENITH // Live Auction Protocol",
  description:
    "On-chain auction protocol powered by Stellar Soroban. Create, bid, settle.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${mono.variable} ${sans.variable}`}>
      <body className="scanlines grid-bg flex min-h-screen flex-col bg-[#0a0a0f] text-[#e8e8f0]">
        <Navbar />
        <div className="flex min-h-screen flex-col">{children}</div>
      </body>
    </html>
  );
}
