"use client";

import { create } from "zustand";
import {
  isConnected,
  isAllowed,
  requestAccess,
  getAddress,
  signTransaction,
} from "@stellar/freighter-api";

export interface WalletState {
  address: string | null;
  isConnecting: boolean;
  error: string | null;

  connect: () => Promise<void>;
  disconnect: () => void;
  signTx: (xdr: string, networkPassphrase: string) => Promise<string>;
}

export const useWalletStore = create<WalletState>((set, get) => ({
  address: null,
  isConnecting: false,
  error: null,

  connect: async () => {
    set({ isConnecting: true, error: null });
    try {
      const connected = await isConnected();
      if (!connected.isConnected) {
        throw new Error("Freighter is not installed or locked");
      }

      const allowed = await isAllowed();
      if (!allowed.isAllowed) {
        await requestAccess();
      }

      const { address } = await getAddress();
      set({ address, isConnecting: false });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to connect wallet";
      set({ error: message, isConnecting: false });
    }
  },

  disconnect: () => set({ address: null, error: null }),

  signTx: async (xdr: string, networkPassphrase: string) => {
    const result = await signTransaction(xdr, { networkPassphrase });
    return result.signedTxXdr;
  },
}));
