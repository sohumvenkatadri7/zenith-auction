"use client";

import { create } from "zustand";
import { TransactionBuilder } from "@stellar/stellar-sdk";

interface WalletState {
  address: string | null;
  isConnecting: boolean;
  error: string | null;
  setAddress: (address: string | null) => void;
  connect: (walletId: string) => Promise<void>;
  disconnect: () => void;
  signTx: (xdr: string, networkPassphrase: string) => Promise<string>;
  signAndSend: (tx: any) => Promise<any>;
}

export const useWalletStore = create<WalletState>((set) => ({
  address: null,
  isConnecting: false,
  error: null,
  setAddress: (address) => set({ address, error: null }),

  connect: async (walletId: string) => {
    set({ isConnecting: true, error: null });
    try {
      const { requestAccess } = await import("@stellar/freighter-api");
      const { address } = await requestAccess();
      set({ address, isConnecting: false });
      console.log("Connected to:", address);
    } catch (err) {
      set({ isConnecting: false, error: err instanceof Error ? err.message : "Connection failed" });
      console.error("Connection denied by user", err);
    }
  },

  disconnect: () => {
    set({ address: null, error: null });
  },

  signTx: async (xdr: string, networkPassphrase: string): Promise<string> => {
    try {
      const { signTransaction } = await import("@stellar/freighter-api");
      const result = await signTransaction(xdr, { networkPassphrase });
      // signTransaction returns { signedTxXdr, signerAddress }
      if (result.error) {
        // Freighter can return error as string or { message: string }
        const msg = typeof result.error === "string"
          ? result.error
          : (result.error.message || "Signing failed");
        // Distinguish user-initiated cancellation from real errors
        if (/rejected|cancelled|canceled|denied/i.test(msg)) {
          throw new Error("Wallet signing was cancelled.");
        }
        throw new Error(msg);
      }
      return result.signedTxXdr;
    } catch (err) {
      // Only log surprising errors to console, not expected user cancellations
      if (err instanceof Error && !/rejected|cancelled|canceled|denied|cancel/i.test(err.message)) {
        console.error("Transaction signing failed:", err);
      }
      throw err;
    }
  },

  signAndSend: async (tx: any) => {
    try {
      const { signTransaction, submitTransaction } = await import("@stellar/freighter-api");
      const result = await signTransaction(tx.toXDR(), { networkPassphrase: "Test SDF Network ; September 2015" });
      if (result.error) {
        throw new Error(result.error.message || "Signing failed");
      }
      const sendResult = await submitTransaction(result.signedTxXdr);
      return sendResult;
    } catch (err) {
      console.error("Wallet signing failed:", err);
      return null;
    }
  },
}));