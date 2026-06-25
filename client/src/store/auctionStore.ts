"use client";

import { create } from "zustand";

export interface AuctionDetails {
  creator: string;
  tokenAddress: string;
  startPrice: bigint;
  minIncrement: bigint;
  endTime: number; // ledger timestamp (seconds)
  currentBid: bigint;
  highestBidder: string | null;
  ended: boolean;
}

export interface BidEvent {
  auctionId: string;
  bidder: string;
  amount: string;
  timestamp: number;
}

interface AuctionState {
  auction: AuctionDetails | null;
  bidHistory: BidEvent[];
  isLoading: boolean;
  error: string | null;
  lastPolledLedger: number;

  setAuction: (details: AuctionDetails) => void;
  setBidHistory: (events: BidEvent[]) => void;
  appendBid: (event: BidEvent) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setLastPolledLedger: (ledger: number) => void;
  reset: () => void;
}

const initialState = {
  auction: null,
  bidHistory: [],
  isLoading: false,
  error: null,
  lastPolledLedger: 0,
};

export const useAuctionStore = create<AuctionState>((set) => ({
  ...initialState,

  setAuction: (details) => set({ auction: details }),
  setBidHistory: (events) => set({ bidHistory: events }),
  appendBid: (event) =>
    set((state) => ({ bidHistory: [...state.bidHistory, event] })),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  setLastPolledLedger: (lastPolledLedger) => set({ lastPolledLedger }),
  reset: () => set(initialState),
}));
