"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface WalletState {
  address: string | null;
  isConnecting: boolean;
  error: string | null;
  balanceRefreshTrigger: number;
  setAddress: (address: string | null) => void;
  connect: (walletId: string) => Promise<void>;
  disconnect: () => void;
  signTx: (xdr: string, networkPassphrase: string) => Promise<string>;
  signAndSend: (tx: any) => Promise<any>;
  autoConnect: () => Promise<void>;
  triggerBalanceRefresh: () => void;
}

export const useWalletStore = create<WalletState>()(
  persist(
    (set, get) => ({
      address: null,
      isConnecting: false,
      error: null,
      balanceRefreshTrigger: 0,
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
          if (result.error) {
            const msg = typeof result.error === "string"
              ? result.error
              : (result.error.message || "Signing failed");
            if (/rejected|cancelled|canceled|denied/i.test(msg)) {
              throw new Error("Wallet signing was cancelled.");
            }
            throw new Error(msg);
          }
          return result.signedTxXdr;
        } catch (err) {
          if (err instanceof Error && !/rejected|cancelled|canceled|denied|cancel/i.test(err.message)) {
            console.error("Transaction signing failed:", err);
          }
          throw err;
        }
      },

      signAndSend: async (tx: any) => {
        const TESTNET = "Test SDF Network ; September 2015";
        try {
          const { signTransaction } = await import("@stellar/freighter-api");
          const signResult = await signTransaction(tx.toXDR(), { networkPassphrase: TESTNET });

          if (signResult.error) {
            const msg = typeof signResult.error === "string"
              ? signResult.error
              : (signResult.error.message || "Signing failed");
            if (/rejected|cancelled|canceled|denied/i.test(msg)) {
              throw new Error("Wallet signing was cancelled.");
            }
            throw new Error(msg);
          }

          const { rpc, TransactionBuilder } = await import("@stellar/stellar-sdk");
          const signedTx = TransactionBuilder.fromXDR(signResult.signedTxXdr, TESTNET);

          const server = new rpc.Server("https://soroban-testnet.stellar.org");
          const sendResult = await server.sendTransaction(signedTx);

          return sendResult;
        } catch (err) {
          if (err instanceof Error && !/rejected|cancelled|canceled|denied|cancel/i.test(err.message)) {
            console.error("signAndSend failed:", err);
          }
          throw err;
        }
      },

      triggerBalanceRefresh: () => set(s => ({ balanceRefreshTrigger: s.balanceRefreshTrigger + 1 })),

      autoConnect: async () => {
        if (typeof window === "undefined") return;

        try {
          const { isAllowed, getAddress } = await import("@stellar/freighter-api");
          const allowed = await isAllowed();
          if (allowed) {
            const { address } = await getAddress();
            set({ address: address || null, error: null });
            console.log("Auto-connected to:", address);
          } else {
            // Clear persisted address if no longer authorized
            set({ address: null, error: null });
          }
        } catch (err) {
          console.log("Auto-connect failed (user may not have Freighter installed or connected):", err);
        }
      },
    }),
    {
      name: "wallet-storage",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ address: state.address }),
    }
  )
);