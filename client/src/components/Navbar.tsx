"use client";

import { useWalletStore } from "@/store/walletStore";

/**
 * Navbar — wallet connection status using Freighter.
 *
 * Features:
 *  - Button to connect/disconnect Freighter wallet
 *  - Truncated address display ("GABC…XYZ") when connected
 *  - Loading spinner during connection
 *  - Error banner on connection failure
 */
export default function Navbar() {
  const { address, isConnecting, error, connect, disconnect } =
    useWalletStore();

  const truncate = (addr: string) =>
    `${addr.slice(0, 4)}…${addr.slice(-4)}`;

  return (
    <header className="border-b-4 border-black bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        {/* Brand */}
        <h1 className="text-2xl font-black uppercase tracking-tight">
          ⚡ Live Auction
        </h1>

        {/* Wallet area */}
        <div className="flex items-center gap-3">
          {error && (
            <span className="rounded-none border-2 border-red-600 bg-red-100 px-3 py-1 text-sm font-bold text-red-800 shadow-[2px_2px_0px_0px_#dc2626]">
              {error}
            </span>
          )}

          {address ? (
            <>
              <span className="font-mono text-sm font-semibold tracking-wide">
                {truncate(address)}
              </span>
              <button
                onClick={disconnect}
                className="border-2 border-black bg-black px-4 py-1.5 text-sm font-bold text-white shadow-[3px_3px_0px_0px_#facc15] transition hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none active:translate-x-1 active:translate-y-1"
              >
                Disconnect
              </button>
            </>
          ) : (
            <button
              onClick={connect}
              disabled={isConnecting}
              className="border-2 border-black bg-yellow-300 px-5 py-1.5 text-sm font-bold shadow-[3px_3px_0px_0px_#000] transition hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none disabled:cursor-wait disabled:opacity-60"
            >
              {isConnecting ? (
                <span className="flex items-center gap-2">
                  <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-black border-t-transparent" />
                  Connecting…
                </span>
              ) : (
                "Connect Wallet"
              )}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
