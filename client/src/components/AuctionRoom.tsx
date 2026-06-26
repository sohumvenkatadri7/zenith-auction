"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useWalletStore } from "@/store/walletStore";
import { useAuctionStore } from "@/store/auctionStore";
import { useAuction } from "@/hooks/useAuction";

interface Props {
  auctionId: bigint;
}

export default function AuctionRoom({ auctionId }: Props) {
  const { address } = useWalletStore();
  const { auction, isLoading, error } = useAuctionStore();
  const { getAuctionDetails, placeBid, claimWinning, reclaimUnsold } = useAuction();

  const [bidAmount, setBidAmount] = useState("");
  const [txStatus, setTxStatus] = useState<"idle" | "submitting" | "error">("idle");
  const [txMessage, setTxMessage] = useState("");
  const [timeLeft, setTimeLeft] = useState<string>("");

  // ── Data Sync ──────────────────────────────────────────
  const refreshAuction = useCallback(async () => {
    await getAuctionDetails(auctionId);
  }, [auctionId, getAuctionDetails]);

  useEffect(() => {
    refreshAuction();
  }, [refreshAuction]);

  // ── Timer ──────────────────────────────────────────────
  useEffect(() => {
    if (!auction) return;
    const interval = setInterval(() => {
      const now = Math.floor(Date.now() / 1000);
      const diff = auction.endTime - now;
      if (diff <= 0) {
        setTimeLeft("AUCTION ENDED");
        clearInterval(interval);
      } else {
        const h = Math.floor(diff / 3600);
        const m = Math.floor((diff % 3600) / 60);
        const s = diff % 60;
        setTimeLeft(`${h}h ${m}m ${s}s`);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [auction]);

  // ── Helpers ──────────────────────────────────────────
  const formatToken = (amount: bigint) => (Number(amount) / 10000000).toFixed(2);

  // ── Handlers ──────────────────────────────────────────
  const handleBid = async (e: React.FormEvent) => {
    e.preventDefault();
    setTxMessage(""); // Clear previous errors
    
    if (!address) return setTxMessage("CONNECT WALLET FIRST");
    
    // 1. Pre-flight check (UI validation)
    const bidValue = Number(bidAmount);
    const hasBids = auction!.highestBid > 0n;
    const currentHigh = Number(formatToken(hasBids ? auction!.highestBid : auction!.startPrice));
    
    if (isNaN(bidValue) || bidValue <= currentHigh) {
      setTxMessage(`BID MUST BE HIGHER THAN ${currentHigh}`);
      return; 
    }

    const priceDecimals = 7;
    const bidBigInt = BigInt(Math.round(bidValue * 10 ** priceDecimals));

    setTxStatus("submitting");

    try {
      await placeBid(auctionId, bidBigInt);
      // Wait for ledger propagation
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await refreshAuction();
      setTxStatus("idle");
      setBidAmount("");
    } catch (err: any) {
      setTxStatus("idle");
      if (err.message.includes("BidTooLow")) {
        setTxMessage("YOUR BID IS TOO LOW. PLEASE BID HIGHER.");
      } else {
        setTxMessage("TRANSACTION FAILED: " + err.message);
      }
    }
  };

  const handleClaim = async () => {
    setTxStatus("submitting");
    try {
      await claimWinning(auctionId);
      await refreshAuction();
      setTxStatus("idle");
    } catch (err: any) {
      setTxMessage(err.message.toUpperCase());
    }
  };

  const handleReclaim = async () => {
    setTxStatus("submitting");
    try {
      await reclaimUnsold(auctionId);
      await refreshAuction();
      setTxStatus("idle");
    } catch (err: any) {
      setTxMessage(err.message.toUpperCase());
    }
  };

  // ── Render States ────────────────────────────────────
  if (isLoading && !auction) {
    return (
      <main className="flex flex-1 items-center justify-center p-10">
        <span className="font-mono text-xs font-bold uppercase tracking-widest text-[#6b6b80]">
          SYNCING WITH LEDGER...
        </span>
      </main>
    );
  }

  if (error || !auction) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 p-10">
        <div className="border-2 border-[#ef4444] bg-[#ef4444]/10 p-6 text-center">
          <p className="font-mono text-xs font-bold uppercase text-[#ef4444]">
            [ERR] {error || "AUCTION NOT FOUND"}
          </p>
        </div>
        <Link href="/" className="text-[10px] font-bold uppercase tracking-wider text-[#3b82f6] hover:underline">
          &lt; RETURN TO EXPLORE
        </Link>
      </main>
    );
  }

  const isEnded = Math.floor(Date.now() / 1000) >= auction.endTime;
  const isCreator = address === auction.creator;
  const isWinner = address === auction.highestBidder;
  const hasBids = auction.highestBid > 0n;

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-6 py-10">
      
      {/* Header */}
      <div className="flex items-end justify-between border-b-2 border-[#1e1e2e] pb-4">
        <div>
          <Link href="/" className="mb-4 inline-block text-[10px] font-bold uppercase tracking-wider text-[#6b6b80] hover:text-[#e8e8f0] transition">
            &lt; BACK
          </Link>
          <h1 className="text-4xl font-black uppercase tracking-tighter text-[#e8e8f0]">
            AUCTION #{auction.id.toString()}
          </h1>
        </div>
        <div className={`border-2 px-3 py-1 text-xs font-bold uppercase tracking-widest ${isEnded ? 'border-[#ef4444] text-[#ef4444]' : 'border-[#22c55e] text-[#22c55e]'}`}>
          {isEnded ? "CLOSED" : "LIVE"}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        
        {/* Column 1: Data */}
        <div className="flex flex-col gap-6">
          <div className="border-2 border-[#1e1e2e] bg-[#0e0e16] p-6">
            <h2 className="mb-4 text-xs font-bold uppercase tracking-widest text-[#44445a]">
              // TERMINAL DATA
            </h2>
            
            <div className="flex flex-col gap-4 font-mono text-sm">
              <div>
                <span className="text-[#6b6b80]">CREATOR:</span>
                <p className="truncate text-[#e8e8f0]">{auction.creator}</p>
              </div>
              <div className="border-t-2 border-dashed border-[#1e1e2e] pt-4">
                <span className="text-[#6b6b80]">CURRENT HIGHEST BID:</span>
                <p className="text-3xl font-bold text-[#3b82f6]">
                  {formatToken(hasBids ? auction.highestBid : auction.startPrice)}
                </p>
                <p className="text-[10px] text-[#44445a] uppercase">
                  Holder: {hasBids ? auction.highestBidder : "NONE"}
                </p>
              </div>
            </div>
            
            <button 
              onClick={refreshAuction}
              className="mt-6 w-full border-2 border-[#1e1e2e] bg-[#0a0a0f] py-2 text-[10px] font-bold uppercase tracking-widest text-[#6b6b80] transition hover:border-[#3b82f6] hover:text-[#3b82f6]"
            >
              [ REFRESH LEDGER STATE ]
            </button>
          </div>
        </div>

        {/* Column 2: Interaction */}
        <div className="flex flex-col gap-6">
          <div className="border-2 border-[#1e1e2e] bg-[#0a0a0f] p-6 shadow-[8px_8px_0px_0px_#050508]">
            <h2 className="mb-4 text-xs font-bold uppercase tracking-widest text-[#44445a]">
              // {isEnded ? "SETTLEMENT" : "TIME REMAINING"}
            </h2>
            
            <div className="mb-6 text-4xl font-black tracking-widest text-[#e8e8f0]">
              {timeLeft}
            </div>

            {!isEnded ? (
              <form onSubmit={handleBid} className="flex flex-col gap-4">
                <input
                  type="text"
                  placeholder="BID AMOUNT..."
                  value={bidAmount}
                  onChange={(e) => setBidAmount(e.target.value)}
                  className="w-full border-2 border-[#1e1e2e] bg-[#0e0e16] px-4 py-3 font-mono text-sm text-[#e8e8f0] outline-none focus:border-[#3b82f6]"
                />
                <button
                  type="submit"
                  disabled={txStatus === "submitting"}
                  className="border-2 border-[#3b82f6] bg-[#3b82f6] py-3 text-sm font-bold uppercase tracking-wider text-white transition hover:-translate-x-1 hover:-translate-y-1 hover:shadow-[4px_4px_0px_0px_#1e40af] disabled:opacity-50"
                >
                  {txStatus === "submitting" ? "SIGNING..." : "[ PLACE BID ]"}
                </button>
              </form>
            ) : (
               <div className="flex flex-col gap-4">
                {isWinner && hasBids && !auction.claimed ? (
                  <button onClick={handleClaim} className="border-2 border-[#22c55e] py-3 font-bold uppercase text-[#22c55e]">CLAIM</button>
                ) : isCreator && !hasBids && !auction.claimed ? (
                  <button onClick={handleReclaim} className="border-2 border-[#eab308] py-3 font-bold uppercase text-[#eab308]">RECLAIM</button>
                ) : (
                  <div className="border-2 border-[#1e1e2e] p-3 text-center text-[10px] text-[#6b6b80]">SETTLED / INACTIVE</div>
                )}
               </div>
            )}

            {/* Friendly Notification "Pop-up" */}
            {txMessage && (
              <div className="mt-6 animate-pulse border-2 border-[#ef4444] bg-[#ef4444]/10 p-4">
                <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-[#ef4444]">
                  ⚠️ ATTENTION REQUIRED
                </p>
                <p className="mt-1 text-sm font-bold text-[#e8e8f0]">
                  {txMessage}
                </p>
              </div>
            )}
          </div>
        </div>

      </div>
    </main>
  );
}