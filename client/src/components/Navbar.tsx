"use client";

import Link from "next/link";
import { useState } from "react";
import { useWalletStore } from "@/store/walletStore";

export default function Navbar() {
  const { address, isConnecting, error, connect, disconnect } =
    useWalletStore();
  const [mobileOpen, setMobileOpen] = useState(false);

  const truncate = (addr: string) =>
    `${addr.slice(0, 4)}...${addr.slice(-4)}`;

  return (
    <header className="sticky top-0 z-50 border-b-2 border-[#1e1e2e] bg-[#0a0a0f]">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-2 transition hover:opacity-80">
          <span className="border-2 border-[#3b82f6] bg-[#3b82f6]/10 px-1.5 py-0.5 text-xs font-bold text-[#3b82f6]">
            #
          </span>
          <span className="text-sm font-bold uppercase tracking-wider text-[#e8e8f0]">
            ZENITH
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-1 sm:flex">
          <Link
            href="/"
            className="border-2 border-transparent px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-[#6b6b80] transition hover:border-[#1e1e2e] hover:text-[#e8e8f0]"
          >
            EXPLORE
          </Link>
          {address && (
            <Link
              href="/create"
              className="border-2 border-transparent px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-[#6b6b80] transition hover:border-[#1e1e2e] hover:text-[#e8e8f0]"
            >
              + CREATE
            </Link>
          )}
        </nav>

        {/* Wallet */}
        <div className="flex items-center gap-3">
          {error && (
            <span className="hidden border-2 border-[#ef4444] bg-[#ef4444]/10 px-2 py-1 text-[10px] font-bold uppercase text-[#ef4444] sm:inline-block">
              {error}
            </span>
          )}

          {address ? (
            <div className="flex items-center gap-3">
              <div className="hidden items-center gap-2 border-2 border-[#1e1e2e] bg-[#0e0e16] px-3 py-1 sm:flex">
                <span className="live-dot" />
                <span className="text-xs text-[#6b6b80]">
                  {truncate(address)}
                </span>
              </div>
              <button
                onClick={disconnect}
                className="border-2 border-[#1e1e2e] bg-[#0e0e16] px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[#6b6b80] transition hover:border-[#ef4444] hover:text-[#ef4444]"
              >
                DISCONNECT
              </button>
            </div>
          ) : (
            <button
              onClick={connect}
              disabled={isConnecting}
              className="border-2 border-[#3b82f6] bg-[#3b82f6] px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-[3px_3px_0px_0px_#1e40af] transition hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[4px_4px_0px_0px_#1e40af] disabled:opacity-60"
            >
              {isConnecting ? "LOADING..." : "[ CONNECT ]"}
            </button>
          )}

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="flex h-7 w-7 flex-col items-center justify-center gap-1 border-2 border-[#1e1e2e] bg-[#0e0e16] sm:hidden"
            aria-label="Toggle menu"
          >
            <span
              className={`block h-0.5 w-3 bg-[#6b6b80] transition-all ${mobileOpen ? "translate-y-[5px] rotate-45" : ""}`}
            />
            <span
              className={`block h-0.5 w-3 bg-[#6b6b80] transition-all ${mobileOpen ? "opacity-0" : ""}`}
            />
            <span
              className={`block h-0.5 w-3 bg-[#6b6b80] transition-all ${mobileOpen ? "-translate-y-[5px] -rotate-45" : ""}`}
            />
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="border-t-2 border-[#1e1e2e] bg-[#0a0a0f] px-6 py-4 sm:hidden">
          <nav className="flex flex-col gap-2">
            <Link
              href="/"
              onClick={() => setMobileOpen(false)}
              className="border-2 border-[#1e1e2e] bg-[#0e0e16] px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-[#6b6b80]"
            >
              EXPLORE
            </Link>
            {address && (
              <Link
                href="/create"
                onClick={() => setMobileOpen(false)}
                className="border-2 border-[#3b82f6] bg-[#3b82f6] px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-white"
              >
                + NEW AUCTION
              </Link>
            )}
          </nav>
          {error && (
            <p className="mt-2 border-2 border-[#ef4444] bg-[#ef4444]/10 px-3 py-2 text-[10px] font-bold uppercase text-[#ef4444]">
              {error}
            </p>
          )}
        </div>
      )}
    </header>
  );
}
