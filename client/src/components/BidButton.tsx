"use client";

import { useState } from "react";

interface BidButtonProps {
  /** Called when the user clicks "Place Bid". */
  onBid: (amount: string) => Promise<void>;
  /** Disable the button (e.g. auction ended, wrong wallet). */
  disabled?: boolean;
  /** Minimum bid amount to display as a hint. */
  minAmount?: string;
}

/**
 * BidButton — triggers a Freighter transaction and handles loading states.
 *
 * Behaviour:
 *  1. User enters an amount and clicks "Place Bid"
 *  2. Button switches to a loading spinner + "Signing…"
 *  3. After the tx is submitted (or on error) the state resets
 *  4. A success / error toast is shown inline
 */
export default function BidButton({
  onBid,
  disabled = false,
  minAmount,
}: BidButtonProps) {
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState<"idle" | "signing" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const handleBid = async () => {
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      setStatus("error");
      setMessage("Enter a valid positive amount");
      return;
    }

    setStatus("signing");
    setMessage("");

    try {
      await onBid(amount);
      setStatus("success");
      setMessage("Bid placed successfully!");
      setAmount("");
      // Auto-clear success message after 4 s
      setTimeout(() => {
        setStatus("idle");
        setMessage("");
      }, 4000);
    } catch (err: unknown) {
      setStatus("error");
      setMessage(
        err instanceof Error ? err.message : "Transaction rejected or failed",
      );
    }
  };

  return (
    <div className="space-y-3">
      {/* Input row */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="flex-1">
          <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-600">
            Your bid
            {minAmount && (
              <span className="ml-2 font-mono text-yellow-700">
                (min {minAmount})
              </span>
            )}
          </span>
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              if (status === "error" || status === "success") {
                setStatus("idle");
                setMessage("");
              }
            }}
            placeholder="0.00"
            disabled={status === "signing" || disabled}
            className="w-full border-2 border-black px-4 py-2.5 text-lg font-bold shadow-[2px_2px_0px_0px_#000] outline-none transition focus:shadow-[4px_4px_0px_0px_#facc15] disabled:opacity-50"
          />
        </label>

        <button
          onClick={handleBid}
          disabled={status === "signing" || disabled}
          className="h-[48px] border-2 border-black bg-black px-8 text-sm font-bold text-white shadow-[3px_3px_0px_0px_#facc15] transition hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none disabled:cursor-not-allowed disabled:opacity-60"
        >
          {status === "signing" ? (
            <span className="flex items-center gap-2">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Signing…
            </span>
          ) : (
            "Place Bid"
          )}
        </button>
      </div>

      {/* Status feedback */}
      {message && (
        <div
          className={`border-2 px-3 py-2 text-sm font-bold shadow-[2px_2px_0px_0px_#000] ${
            status === "success"
              ? "border-green-700 bg-green-100 text-green-900"
              : status === "error"
                ? "border-red-600 bg-red-100 text-red-900"
                : ""
          }`}
        >
          {message}
        </div>
      )}
    </div>
  );
}
