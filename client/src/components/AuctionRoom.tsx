"use client";

import { useEffect, useState, useCallback } from "react";
import { useWalletStore } from "@/store/walletStore";
import { useAuctionStore } from "@/store/auctionStore";
import { useAuction } from "@/hooks/useAuction";
import BidButton from "./BidButton";

/**
 * AuctionRoom — main page component showing a live auction.
 *
 * Renders:
 *  - Countdown timer (synchronised to ledger time)
 *  - Current highest bid + bidder
 *  - Bid input & submit button (via `BidButton`)
 *  - Claim button (when auction has ended and caller is winner)
 *  - Real-time event feed via `pollBidEvents` (no page refresh needed)
 *
 * The component is marked `'use client'` so it can hold all interactive
 * state, intervals, and wallet interaction.
 */
export default function AuctionRoom() {
  const { address } = useWalletStore();
  const { auction, isLoading, error, bidHistory } = useAuctionStore();
  const { placeBid, claimWinning, getAuctionDetails, pollBidEvents } =
    useAuction();

  // Hard-coded auction ID for this demo — in a real app this would come
  // from the URL params or a list of active auctions.
  const AUCTION_ID = 1n;

  // ── Countdown state (seconds remaining) ──────────────────────────
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  // ── Initial data load ────────────────────────────────────────────
  useEffect(() => {
    getAuctionDetails(AUCTION_ID);
  }, [getAuctionDetails, AUCTION_ID]);

  // ── Countdown tick (every second) ────────────────────────────────
  useEffect(() => {
    if (!auction) return;

    const tick = () => {
      // The auction's endTime is a ledger timestamp (Unix seconds).
      // We approximate using the browser clock, correcting the offset
      // once when the auction is first loaded.
      const now = Math.floor(Date.now() / 1000);
      const remaining = Math.max(0, auction.endTime - now);
      setTimeLeft(remaining);
    };

    tick(); // immediate first tick
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [auction]);

  // ── Event polling for real-time bid updates ──────────────────────
  // Polls the RPC every 5 s for new `bid_placed` events. When a new bid
  // is detected, we re-fetch the full auction details to keep the UI in sync.
  useEffect(() => {
    if (!address) return;

    pollBidEvents(String(AUCTION_ID));

    const interval = setInterval(() => {
      pollBidEvents(String(AUCTION_ID));
    }, 5000);

    return () => clearInterval(interval);
  }, [address, pollBidEvents, AUCTION_ID]);

  // Re-fetch details whenever a new bid event arrives
  useEffect(() => {
    if (bidHistory.length > 0) {
      getAuctionDetails(AUCTION_ID);
    }
  }, [bidHistory.length, getAuctionDetails, AUCTION_ID]);

  // ── Bid handler ──────────────────────────────────────────────────
  const handleBid = useCallback(
    async (amount: string) => {
      // Convert user-friendly amount to the smallest unit.
      // For 7-decimal tokens: multiply by 10_000_000.
      const decimals = 7;
      const parsed = BigInt(Math.round(Number(amount) * 10 ** decimals));
      await placeBid(AUCTION_ID, parsed);
      // Refresh auction details after a successful bid
      await getAuctionDetails(AUCTION_ID);
    },
    [placeBid, getAuctionDetails, AUCTION_ID],
  );

  // ── Claim handler ────────────────────────────────────────────────
  const handleClaim = useCallback(async () => {
    await claimWinning(AUCTION_ID);
    await getAuctionDetails(AUCTION_ID);
  }, [claimWinning, getAuctionDetails, AUCTION_ID]);

  // ── Format helpers ───────────────────────────────────────────────
  const formatTime = (seconds: number): string => {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    const parts = [];
    if (d > 0) parts.push(`${d}d`);
    parts.push(`${String(h).padStart(2, "0")}h`);
    parts.push(`${String(m).padStart(2, "0")}m`);
    parts.push(`${String(s).padStart(2, "0")}s`);
    return parts.join(" ");
  };

  const formatAmount = (val: bigint): string => {
    const decimals = 7;
    const divisor = 10n ** BigInt(decimals);
    const whole = val / divisor;
    const frac = val % divisor;
    return `${whole}.${String(frac).padStart(decimals, "0")}`;
  };

  // ── Loading / empty states ───────────────────────────────────────
  if (isLoading && !auction) {
    return (
      <div className="flex flex-1 items-center justify-center p-12">
        <div className="flex items-center gap-3 text-lg font-bold">
          <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-black border-t-transparent" />
          Loading auction…
        </div>
      </div>
    );
  }

  if (error && !auction) {
    return (
      <div className="flex flex-1 items-center justify-center p-12">
        <div className="max-w-md border-4 border-red-600 bg-red-50 p-6 text-center shadow-[6px_6px_0px_0px_#dc2626]">
          <p className="text-lg font-bold text-red-900">{error}</p>
          <button
            onClick={() => getAuctionDetails(AUCTION_ID)}
            className="mt-4 border-2 border-red-600 bg-white px-4 py-2 text-sm font-bold shadow-[2px_2px_0px_0px_#dc2626] transition hover:translate-x-0.5 hover:translate-y-0.5"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!auction) {
    return (
      <div className="flex flex-1 items-center justify-center p-12">
        <p className="text-lg font-bold text-gray-500">
          No auction data available.
        </p>
      </div>
    );
  }

  const isEnded = auction.ended || (timeLeft !== null && timeLeft <= 0);
  const isWinner =
    address && auction.highestBidder
      ? address === auction.highestBidder
      : false;

  // ── Main UI ──────────────────────────────────────────────────────
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-10">
      {/* ── Countdown ──────────────────────────────────────────── */}
      <section className="border-4 border-black bg-white p-6 shadow-[8px_8px_0px_0px_#000]">
        <h2 className="mb-1 text-xs font-bold uppercase tracking-widest text-gray-500">
          Time Remaining
        </h2>
        <p
          className={`font-mono text-5xl font-black tracking-tight ${
            isEnded ? "text-red-600" : "text-black"
          }`}
        >
          {timeLeft !== null ? formatTime(timeLeft) : "—"}
        </p>
        {isEnded && (
          <span className="mt-1 inline-block border-2 border-red-600 bg-red-100 px-2 py-0.5 text-xs font-bold uppercase text-red-800">
            Auction Ended
          </span>
        )}
      </section>

      {/* ── Highest Bid ────────────────────────────────────────── */}
      <section className="border-4 border-black bg-white p-6 shadow-[8px_8px_0px_0px_#000]">
        <h2 className="mb-1 text-xs font-bold uppercase tracking-widest text-gray-500">
          Highest Bid
        </h2>
        <p className="text-4xl font-black">
          {auction.currentBid > 0n
            ? `${formatAmount(auction.currentBid)}`
            : `${formatAmount(auction.startPrice)}`}
        </p>
        {auction.highestBidder && (
          <p className="mt-1 font-mono text-sm text-gray-600">
            by{" "}
            <span className="font-bold text-black">
              {auction.highestBidder.slice(0, 4)}…
              {auction.highestBidder.slice(-4)}
            </span>
          </p>
        )}
        {!auction.highestBidder && (
          <p className="mt-1 text-sm font-semibold text-yellow-700">
            No bids yet — be the first!
          </p>
        )}
      </section>

      {/* ── Bid / Claim ────────────────────────────────────────── */}
      <section className="border-4 border-black bg-white p-6 shadow-[8px_8px_0px_0px_#000]">
        {!address ? (
          <p className="text-center text-sm font-bold text-gray-500">
            Connect your wallet to place a bid.
          </p>
        ) : isEnded ? (
          isWinner && !auction.ended ? (
            <button
              onClick={handleClaim}
              disabled={isLoading}
              className="w-full border-2 border-green-700 bg-green-500 px-6 py-3 text-lg font-bold text-white shadow-[4px_4px_0px_0px_#15803d] transition hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none disabled:opacity-60"
            >
              {isLoading ? "Claiming…" : "Claim Winning"}
            </button>
          ) : (
            <p className="text-center text-sm font-bold text-gray-500">
              {isWinner
                ? "Auction ended. Claim your winnings above."
                : `Auction ended. Winner: ${auction.highestBidder?.slice(0, 4)}…${auction.highestBidder?.slice(-4)}`}
            </p>
          )
        ) : (
          <BidButton
            onBid={handleBid}
            disabled={isLoading}
            minAmount={formatAmount(
              auction.currentBid > 0n
                ? auction.currentBid + auction.minIncrement
                : auction.startPrice,
            )}
          />
        )}
      </section>

      {/* ── Bid History Feed ───────────────────────────────────── */}
      {bidHistory.length > 0 && (
        <section className="border-4 border-black bg-white p-6 shadow-[8px_8px_0px_0px_#000]">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-gray-500">
            Recent Bids
          </h2>
          <ul className="divide-y-2 divide-black">
            {[...bidHistory].reverse().map((evt, i) => (
              <li
                key={`${evt.bidder}-${evt.timestamp}-${i}`}
                className="flex items-center justify-between py-2 font-mono text-sm"
              >
                <span className="font-bold">
                  {evt.bidder.slice(0, 4)}…{evt.bidder.slice(-4)}
                </span>
                <span className="font-black">{formatAmount(BigInt(evt.amount))}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
