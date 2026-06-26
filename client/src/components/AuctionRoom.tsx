"use client";

import { useEffect, useState, useCallback } from "react";
import { useWalletStore } from "@/store/walletStore";
import { useAuctionStore } from "@/store/auctionStore";
import { useAuction } from "@/hooks/useAuction";
import { formatAmount, formatDuration } from "@/lib/format";
import BidButton from "./BidButton";

interface AuctionRoomProps {
  auctionId: bigint;
}

export default function AuctionRoom({ auctionId }: AuctionRoomProps) {
  const { address } = useWalletStore();
  const { auction, isLoading, error, bidHistory } = useAuctionStore();
  const { placeBid, claimWinning, getAuctionDetails, pollBidEvents } =
    useAuction();

  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  useEffect(() => {
    getAuctionDetails(auctionId);
  }, [getAuctionDetails, auctionId]);

  useEffect(() => {
    if (!auction) return;
    const tick = () => {
      const now = Math.floor(Date.now() / 1000);
      setTimeLeft(Math.max(0, auction.endTime - now));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [auction]);

  useEffect(() => {
    if (!address) return;
    pollBidEvents(String(auctionId));
    const interval = setInterval(() => pollBidEvents(String(auctionId)), 5000);
    return () => clearInterval(interval);
  }, [address, pollBidEvents, auctionId]);

  useEffect(() => {
    if (bidHistory.length > 0) getAuctionDetails(auctionId);
  }, [bidHistory.length, getAuctionDetails, auctionId]);

  const handleBid = useCallback(
    async (amount: string) => {
      const decimals = 7;
      const parsed = BigInt(Math.round(Number(amount) * 10 ** decimals));
      await placeBid(auctionId, parsed);
      await getAuctionDetails(auctionId);
    },
    [placeBid, getAuctionDetails, auctionId],
  );

  const handleClaim = useCallback(async () => {
    await claimWinning(auctionId);
    await getAuctionDetails(auctionId);
  }, [claimWinning, getAuctionDetails, auctionId]);

  // ── Loading ───────────────────────────────────────────
  if (isLoading && !auction) {
    return (
      <div className="flex flex-1 items-center justify-center p-12">
        <div className="flex items-center gap-3">
          <span className="inline-block h-4 w-4 animate-spin border-2 border-[#44445a] border-t-[#3b82f6]" />
          <span className="text-xs font-bold uppercase text-[#6b6b80]">
            LOADING AUCTION...
          </span>
        </div>
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────
  if (error && !auction) {
    return (
      <div className="flex flex-1 items-center justify-center p-12">
        <div className="brutal-static max-w-md p-8 text-center">
          <p className="mb-1 text-[10px] font-bold uppercase text-[#ef4444]">
            [ERR]
          </p>
          <p className="mb-4 text-sm font-bold text-[#e8e8f0]">{error}</p>
          <button
            onClick={() => getAuctionDetails(auctionId)}
            className="border-2 border-[#1e1e2e] bg-[#0e0e16] px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-[#6b6b80] transition hover:border-[#3b82f6] hover:text-[#3b82f6]"
          >
            RETRY
          </button>
        </div>
      </div>
    );
  }

  if (!auction) {
    return (
      <div className="flex flex-1 items-center justify-center p-12">
        <p className="font-mono text-xs text-[#44445a]">
          AUCTION_NOT_FOUND
        </p>
      </div>
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const isStarted = now >= auction.startTime;
  const isEnded =
    auction.ended || (timeLeft !== null && timeLeft <= 0) || now > auction.endTime;
  const isWinner =
    address && auction.highestBidder ? address === auction.highestBidder : false;

  const statusCls = auction.claimed
    ? "border-[#6b6b80] bg-[#6b6b80]/10 text-[#6b6b80]"
    : isEnded
      ? "border-[#ef4444] bg-[#ef4444]/10 text-[#ef4444]"
      : isStarted
        ? "border-[#22c55e] bg-[#22c55e]/10 text-[#22c55e]"
        : "border-[#eab308] bg-[#eab308]/10 text-[#eab308]";

  const statusLabel = auction.claimed
    ? "SETTLED"
    : isEnded
      ? "ENDED"
      : isStarted
        ? "LIVE"
        : "PENDING";

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 px-6 py-10">
      {/* ── Header ───────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <h1 className="font-mono text-xs text-[#44445a]">
          AUCTION #{auctionId.toString()}
        </h1>
        <span
          className={`flex items-center gap-1.5 border px-2.5 py-0.5 text-[10px] font-bold uppercase ${statusCls}`}
        >
          {statusLabel === "LIVE" && (
            <span className="live-dot" />
          )}
          {statusLabel}
        </span>
      </div>

      {/* ── Countdown ─────────────────────────────────── */}
      <section className="brutal-static p-6">
        <h2 className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[#44445a]">
          // {isStarted ? "TIME REMAINING" : "STARTS IN"}
        </h2>
        <p
          className={`font-mono text-5xl font-bold tracking-tight ${
            isEnded ? "text-[#ef4444]" : "text-[#e8e8f0]"
          }`}
        >
          {timeLeft !== null ? formatDuration(timeLeft) : "--:--:--"}
        </p>
      </section>

      {/* ── Highest Bid ──────────────────────────────── */}
      <section className="brutal-static p-6">
        <h2 className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[#44445a]">
          // HIGHEST BID
        </h2>
        <p className="text-4xl font-bold tracking-tight text-[#e8e8f0]">
          {auction.highestBid > 0n
            ? formatAmount(auction.highestBid)
            : formatAmount(auction.startPrice)}
        </p>
        {auction.highestBidder && auction.highestBid > 0n ? (
          <p className="mt-2 text-xs text-[#44445a]">
            BIDDER:{" "}
            <span className="font-bold text-[#6b6b80]">
              {auction.highestBidder.slice(0, 4)}...
              {auction.highestBidder.slice(-4)}
            </span>
          </p>
        ) : (
          <p className="mt-2 text-xs font-bold text-[#3b82f6]">
            NO BIDS YET
          </p>
        )}
      </section>

      {/* ── Bid / Claim ──────────────────────────────── */}
      <section className="brutal-static p-6">
        {!address ? (
          <p className="text-center text-xs font-bold uppercase text-[#44445a]">
            CONNECT WALLET TO BID
          </p>
        ) : !isStarted ? (
          <p className="text-center text-xs font-bold uppercase text-[#44445a]">
            AUCTION HAS NOT STARTED
          </p>
        ) : isEnded && !auction.ended && auction.highestBid > 0n && isWinner ? (
          <button
            onClick={handleClaim}
            disabled={isLoading}
            className="w-full border-2 border-[#22c55e] bg-[#22c55e] px-6 py-3.5 text-sm font-bold uppercase tracking-wider text-black shadow-[4px_4px_0px_0px_#15803d] transition hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[6px_6px_0px_0px_#15803d] disabled:opacity-60"
          >
            {isLoading ? "SETTLING..." : "[ CLAIM WINNING ]"}
          </button>
        ) : isEnded ? (
          <p className="text-center text-xs font-bold uppercase text-[#6b6b80]">
            {isWinner
              ? "AUCTION ENDED. CLAIM ABOVE."
              : auction.highestBidder && auction.highestBid > 0n
                ? `WINNER: ${auction.highestBidder.slice(0, 4)}...${auction.highestBidder.slice(-4)}`
                : "AUCTION ENDED. NO BIDS."}
          </p>
        ) : (
          <BidButton
            onBid={handleBid}
            disabled={isLoading}
            minAmount={formatAmount(
              auction.highestBid > 0n
                ? auction.highestBid + 1n
                : auction.startPrice,
            )}
          />
        )}
      </section>

      {/* ── Bid History ──────────────────────────────── */}
      {bidHistory.length > 0 && (
        <section className="brutal-static p-6">
          <h2 className="mb-4 text-[10px] font-bold uppercase tracking-widest text-[#44445a]">
            // BID LOG
          </h2>
          <ul className="divide-y-2 divide-[#1e1e2e]">
            {[...bidHistory].reverse().map((evt, i) => (
              <li
                key={`${evt.bidder}-${evt.timestamp}-${i}`}
                className="flex items-center justify-between py-2.5 font-mono text-xs"
              >
                <span className="text-[#6b6b80]">
                  {evt.bidder.slice(0, 4)}...{evt.bidder.slice(-4)}
                </span>
                <span className="font-bold text-[#e8e8f0]">
                  {formatAmount(BigInt(evt.amount))}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
