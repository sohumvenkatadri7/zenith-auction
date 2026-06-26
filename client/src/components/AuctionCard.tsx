"use client";

import Link from "next/link";
import { type AuctionDetails } from "@/store/auctionStore";
import { useEffect, useState } from "react";

interface Props {
  auction: AuctionDetails;
}

export default function AuctionCard({ auction }: Props) {
  const [timeLeft, setTimeLeft] = useState("");
  const isEnded = Math.floor(Date.now() / 1000) >= auction.endTime;
  const hasBids = auction.highestBid > 0n;

  // Format the 7-decimal integer to a readable string
  const formatToken = (amount: bigint) => (Number(amount) / 10000000).toFixed(2);
  const truncate = (str: string) => `${str.slice(0, 4)}...${str.slice(-4)}`;

  useEffect(() => {
    const interval = setInterval(() => {
      const diff = auction.endTime - Math.floor(Date.now() / 1000);
      if (diff <= 0) {
        setTimeLeft("ENDED");
      } else {
        const h = Math.floor(diff / 3600);
        const m = Math.floor((diff % 3600) / 60);
        const s = diff % 60;
        setTimeLeft(`${h}h ${m}m ${s}s`);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [auction.endTime]);

  return (
    <Link
      href={`/auction/${auction.id.toString()}`}
      className="group relative flex flex-col border-2 border-[#1e1e2e] bg-[#0a0a0f] p-5 shadow-[4px_4px_0px_0px_#050508] transition hover:-translate-x-1 hover:-translate-y-1 hover:border-[#3b82f6] hover:shadow-[6px_6px_0px_0px_#1e40af]"
    >
      {/* Header */}
      <div className="mb-4 flex items-center justify-between border-b-2 border-dashed border-[#1e1e2e] pb-3">
        <span className="font-mono text-xs font-bold text-[#e8e8f0]">
          ID #{auction.id.toString()}
        </span>
        <div
          className={`border-2 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${
            isEnded
              ? "border-[#ef4444] text-[#ef4444]"
              : "border-[#22c55e] text-[#22c55e]"
          }`}
        >
          {isEnded ? "CLOSED" : "LIVE"}
        </div>
      </div>

      {/* Main Stats */}
      <div className="mb-6 flex flex-col gap-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#6b6b80]">
            CURRENT BID
          </p>
          <p className="text-2xl font-black text-[#3b82f6]">
            {formatToken(hasBids ? auction.highestBid : auction.startPrice)}
          </p>
        </div>
        <div className="flex justify-between text-[10px] uppercase text-[#44445a]">
          <span>Asset: {truncate(auction.token)}</span>
          <span>Bids: {hasBids ? "YES" : "NO"}</span>
        </div>
      </div>

      {/* Footer / Timer */}
      <div className="mt-auto flex items-center justify-between bg-[#0e0e16] px-3 py-2">
        <span className="font-mono text-xs font-bold text-[#e8e8f0]">
          {isEnded ? "[ SETTLEMENT READY ]" : timeLeft}
        </span>
        <span className="text-xs font-bold text-[#3b82f6] opacity-0 transition group-hover:opacity-100">
          ENTER &rarr;
        </span>
      </div>
    </Link>
  );
}