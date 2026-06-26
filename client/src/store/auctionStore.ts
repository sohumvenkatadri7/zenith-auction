"use client";

import { create } from "zustand";

export interface AuctionDetails {
  id: bigint;
  creator: string;
  token: string;
  bidToken: string;
  startPrice: bigint;
  highestBid: bigint;
  highestBidder: string;
  startTime: number;
  endTime: number;
  ended: boolean;
  claimed: boolean;
}

export interface BidEvent {
  auctionId: string;
  bidder: string;
  amount: string;
  timestamp: number;
}

interface AuctionState {
  /** Currently viewed auction details */
  auction: AuctionDetails | null;
  /** List of all known auctions (for home page) */
  auctions: AuctionDetails[];
  bidHistory: BidEvent[];
  isLoading: boolean;
  error: string | null;
  lastPolledLedger: number;

  setAuction: (details: AuctionDetails) => void;
  setAuctions: (auctions: AuctionDetails[]) => void;
  updateAuction: (details: AuctionDetails) => void;
  setBidHistory: (events: BidEvent[]) => void;
  appendBid: (event: BidEvent) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setLastPolledLedger: (ledger: number) => void;
  reset: () => void;
}

const initialState = {
  auction: null,
  auctions: [],
  bidHistory: [],
  isLoading: false,
  error: null,
  lastPolledLedger: 0,
};

export const useAuctionStore = create<AuctionState>((set) => ({
  ...initialState,

  setAuction: (details) => set({ auction: details }),
  setAuctions: (auctions) => set({ auctions }),
  updateAuction: (details) =>
    set((state) => ({
      auctions: state.auctions.map((a) =>
        a.id === details.id ? details : a,
      ),
      auction: state.auction?.id === details.id ? details : state.auction,
    })),
  setBidHistory: (events) => set({ bidHistory: events }),
  appendBid: (event) =>
    set((state) => ({ bidHistory: [...state.bidHistory, event] })),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  setLastPolledLedger: (lastPolledLedger) => set({ lastPolledLedger }),
  reset: () => set(initialState),
}));
