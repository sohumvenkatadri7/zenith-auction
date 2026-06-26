"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useWalletStore } from "@/store/walletStore";
import { useAuctionStore } from "@/store/auctionStore";
import { useAuction } from "@/hooks/useAuction";

export default function CreateAuctionPage() {
  const router = useRouter();
  const { address } = useWalletStore();
  const { auctions } = useAuctionStore();
  const { createAuction, addKnownAuctionId, fetchAllAuctions } = useAuction();

  const [tokenAddress, setTokenAddress] = useState("");
  const [bidTokenAddress, setBidTokenAddress] = useState("");
  const [startPrice, setStartPrice] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  // Ensure we have the latest auctions loaded from the ledger
  useEffect(() => {
    if (address) {
      fetchAllAuctions();
    }
  }, [address, fetchAllAuctions]);

  // Filter global state for ONLY auctions hosted by the connected wallet
  const myHostedAuctions = auctions.filter((a) => a.creator === address);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      const cleanTokenAddress = tokenAddress.trim();
      const cleanBidTokenAddress = bidTokenAddress.trim();
      const cleanStartPrice = startPrice.trim();

      if (!address) {
        setStatus("error");
        setMessage("CONNECT WALLET FIRST");
        return;
      }

      if (!cleanTokenAddress || !cleanBidTokenAddress || !cleanStartPrice || !startTime || !endTime) {
        setStatus("error");
        setMessage("ALL FIELDS REQUIRED");
        return;
      }

      const startTs = Math.floor(new Date(startTime).getTime() / 1000);
      const endTs = Math.floor(new Date(endTime).getTime() / 1000);
      const priceDecimals = 7;
      const priceBigInt = BigInt(Math.round(Number(cleanStartPrice) * 10 ** priceDecimals));

      if (endTs <= startTs) {
        setStatus("error");
        setMessage("END TIME MUST BE AFTER START TIME");
        return;
      }

      if (priceBigInt <= 0n) {
        setStatus("error");
        setMessage("STARTING PRICE MUST BE > 0");
        return;
      }

      setStatus("submitting");
      setMessage("");

      try {
        const knownIds = JSON.parse(
          localStorage.getItem("zenith_known_auction_ids") || "[]",
        );
        const nextId = knownIds.length > 0
          ? Math.max(...knownIds.map(Number)) + 1
          : 1;

        await createAuction(
          address,
          cleanTokenAddress,
          cleanBidTokenAddress,
          priceBigInt,
          startTs,
          endTs,
        );

        addKnownAuctionId(BigInt(nextId));

        setStatus("success");
        setMessage(`AUCTION #${nextId} CREATED. REDIRECTING...`);

        setTimeout(() => {
          router.push(`/auction/${nextId}`);
        }, 2000);
      } catch (err: unknown) {
        setStatus("error");
        setMessage(
          err instanceof Error ? err.message.toUpperCase() : "TRANSACTION FAILED",
        );
      }
    },
    [
      address,
      tokenAddress,
      bidTokenAddress,
      startPrice,
      startTime,
      endTime,
      createAuction,
      addKnownAuctionId,
      router,
    ],
  );

  const inputClass =
    "w-full border-2 border-[#1e1e2e] bg-[#0e0e16] px-4 py-3.5 font-mono text-sm text-[#e8e8f0] outline-none transition placeholder:text-[#44445a] disabled:opacity-50 focus:border-[#3b82f6]";

  // ── Not connected ────────────────────────────────────
  if (!address) {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center gap-6 px-6 py-16">
        <div className="brutal-static border-2 border-[#1e1e2e] bg-[#0e0e16] p-10 text-center">
          <p className="font-mono text-xs text-[#44445a]">
            WALLET_NOT_CONNECTED
          </p>
        </div>
      </main>
    );
  }

  // ── Form + Dashboard Layout ──────────────────────────
  return (
    <main className="mx-auto grid w-full max-w-6xl flex-1 grid-cols-1 gap-10 px-6 py-10 lg:grid-cols-3">
      
      {/* Left Column: The Form (Takes up 2/3 of the space) */}
      <div className="flex flex-col gap-8 lg:col-span-2">
        <div>
          <h1 className="text-2xl font-bold uppercase tracking-tight text-[#e8e8f0]">
            // NEW AUCTION
          </h1>
          <p className="mt-1 text-xs text-[#6b6b80]">
            List a Soroban token. You must hold at least 1 unit of the auctioned token.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          <div>
            <label className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-[#44445a]">
              TOKEN_ADDRESS *
            </label>
            <input
              type="text"
              value={tokenAddress}
              onChange={(e) => setTokenAddress(e.target.value)}
              placeholder="C..."
              className={inputClass}
            />
          </div>

          <div>
            <label className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-[#44445a]">
              BID_TOKEN_ADDRESS *
            </label>
            <input
              type="text"
              value={bidTokenAddress}
              onChange={(e) => setBidTokenAddress(e.target.value)}
              placeholder="C..."
              className={inputClass}
            />
          </div>

          <div>
            <label className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-[#44445a]">
              START_PRICE *
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={startPrice}
              onChange={(e) => setStartPrice(e.target.value)}
              placeholder="0.00"
              className={inputClass}
            />
            <p className="mt-1 text-[10px] text-[#44445a]">
              MINIMUM BID AMOUNT (7 DECIMALS)
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-[#44445a]">
                START_TIME *
              </label>
              <input
                type="datetime-local"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-[#44445a]">
                END_TIME *
              </label>
              <input
                type="datetime-local"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          {message && (
            <div
              className={`border-2 px-4 py-3 text-[10px] font-bold uppercase tracking-wider ${
                status === "success"
                  ? "border-[#22c55e] bg-[#22c55e]/10 text-[#22c55e]"
                  : status === "error"
                    ? "border-[#ef4444] bg-[#ef4444]/10 text-[#ef4444]"
                    : ""
              }`}
            >
              {status === "success" ? "[OK] " : "[ERR] "}
              {message}
            </div>
          )}

          <button
            type="submit"
            disabled={status === "submitting"}
            className="border-2 border-[#3b82f6] bg-[#3b82f6] px-6 py-4 text-sm font-bold uppercase tracking-wider text-white shadow-[4px_4px_0px_0px_#1e40af] transition hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[6px_6px_0px_0px_#1e40af] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {status === "submitting" ? "SUBMITTING..." : "[ DEPLOY CONTRACT ]"}
          </button>
        </form>
      </div>

      {/* Right Column: Hosted Auctions Feed */}
      <div className="flex flex-col gap-6 border-t-2 border-[#1e1e2e] pt-10 lg:border-l-2 lg:border-t-0 lg:pl-10 lg:pt-0">
        <h2 className="text-xs font-bold uppercase tracking-widest text-[#44445a]">
          // YOUR DEPLOYMENTS
        </h2>

        {myHostedAuctions.length === 0 ? (
          <div className="border-2 border-dashed border-[#1e1e2e] p-8 text-center">
            <p className="font-mono text-xs text-[#6b6b80]">NO_ACTIVE_HOSTS</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {myHostedAuctions.map((auction) => {
              const isEnded = Math.floor(Date.now() / 1000) >= auction.endTime;
              
              return (
                <Link
                  href={`/auction/${auction.id}`}
                  key={auction.id.toString()}
                  className="group block border-2 border-[#1e1e2e] bg-[#0a0a0f] p-4 transition hover:border-[#3b82f6]"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-[#e8e8f0]">
                      ID #{auction.id.toString()}
                    </span>
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider ${
                        isEnded ? "text-[#ef4444]" : "text-[#22c55e]"
                      }`}
                    >
                      {isEnded ? "ENDED" : "LIVE"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[10px] uppercase text-[#6b6b80]">
                    <span>BIDS: {auction.highestBid > 0n ? "YES" : "NO"}</span>
                    <span className="text-[#3b82f6] opacity-0 transition group-hover:opacity-100">
                      VIEW &rarr;
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

    </main>
  );
}