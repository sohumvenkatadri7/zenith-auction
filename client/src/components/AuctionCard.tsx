"use client";

import Link from "next/link";
import type { AuctionDetails } from "@/store/auctionStore";
import { formatAmount, formatDuration } from "@/lib/format";

interface AuctionCardProps {
  auction: AuctionDetails;
}

function getTimeLeft(endTime: number): string {
  const now = Math.floor(Date.now() / 1000);
  const remaining = Math.max(0, endTime - now);
  if (remaining <= 0) return "ENDED";
  return formatDuration(remaining);
}

function getStatus(auction: AuctionDetails): {
  label: string;
  cls: string;
} {
  if (auction.claimed)
    return { label: "SETTLED", cls: "border-[#6b6b80] bg-[#6b6b80]/10 text-[#6b6b80]" };
  if (auction.ended)
    return { label: "ENDED", cls: "border-[#ef4444] bg-[#ef4444]/10 text-[#ef4444]" };
  const now = Math.floor(Date.now() / 1000);
  if (now < auction.startTime)
    return { label: "PENDING", cls: "border-[#eab308] bg-[#eab308]/10 text-[#eab308]" };
  return { label: "LIVE", cls: "border-[#22c55e] bg-[#22c55e]/10 text-[#22c55e]" };
}

export default function AuctionCard({ auction }: AuctionCardProps) {
  const status = getStatus(auction);
  const isLive =
    !auction.ended &&
    !auction.claimed &&
    Math.floor(Date.now() / 1000) >= auction.startTime;

  return (
    <Link
      href={`/auction/${auction.id.toString()}`}
      className="group brutal block p-5"
    >
      {/* Header */}
      <div className="mb-4 flex items-start justify-between">
        <span className="font-mono text-[10px] text-[#44445a]">
          #{auction.id.toString()}
        </span>
        <span
          className={`border px-2 py-0.5 text-[10px] font-bold uppercase ${status.cls}`}
        >
          {status.label === "LIVE" && (
            <span className="mr-1 inline-block h-1.5 w-1.5 bg-[#22c55e] animate-pulse" />
          )}
          {status.label}
        </span>
      </div>

      {/* Price */}
      <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-[#44445a]">
        {auction.highestBid > 0n ? "CURRENT BID" : "START PRICE"}
      </p>
      <p className="mb-3 text-2xl font-bold tracking-tight text-[#e8e8f0]">
        {formatAmount(
          auction.highestBid > 0n ? auction.highestBid : auction.startPrice,
        )}
      </p>

      {/* Bidder */}
      {auction.highestBidder && auction.highestBid > 0n && (
        <p className="mb-3 text-[10px] text-[#44445a]">
          BIDDER:{" "}
          <span className="text-[#6b6b80]">
            {auction.highestBidder.slice(0, 4)}...{auction.highestBidder.slice(-4)}
          </span>
        </p>
      )}

      {/* Footer */}
      <div className="border-t-2 border-[#1e1e2e] pt-3">
        {isLive ? (
          <div className="flex items-center gap-2">
            <span className="live-dot" />
            <p className="font-mono text-xs font-bold text-[#e8e8f0]">
              {getTimeLeft(auction.endTime)}
            </p>
          </div>
        ) : auction.claimed ? (
          <p className="text-xs font-bold uppercase text-[#6b6b80]">
            AUCTION COMPLETE
          </p>
        ) : auction.ended ? (
          <p className="text-xs font-bold uppercase text-[#ef4444]">
            AUCTION ENDED
          </p>
        ) : (
          <p className="text-xs font-bold uppercase text-[#eab308]">
            STARTS IN {getTimeLeft(auction.startTime)}
          </p>
        )}
      </div>

      {/* Hover arrow */}
      <div className="mt-3 text-right text-xs font-bold uppercase text-[#3b82f6] opacity-0 transition group-hover:opacity-100">
        VIEW →
      </div>
    </Link>
  );
}
