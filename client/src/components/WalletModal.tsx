"use client";

import { useEffect, useState } from "react";
import { useWalletStore } from "@/store/walletStore";
import { StellarWalletsKit, Networks } from "@creit.tech/stellar-wallets-kit";
import { defaultModules } from "@creit.tech/stellar-wallets-kit/modules/utils";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Multi-Wallet Modal — dynamically discovers available wallet modules
 * via StellarWalletsKit.refreshSupportedWallets() at runtime.
 * Desktop users get Freighter; mobile users get Albedo/WalletConnect/LOBSTR.
 */
export default function WalletModal({ isOpen, onClose }: Props) {
  const connect = useWalletStore((s) => s.connect);
  const [mounted, setMounted] = useState(false);
  const [wallets, setWallets] = useState<
    Array<{ id: string; name: string; isAvailable: boolean }>
  >([]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || !isOpen) return;
    let cancelled = false;
    (async () => {
      try {
        StellarWalletsKit.init({
          modules: defaultModules(),
          network: Networks.TESTNET,
        });
        const supported = await StellarWalletsKit.refreshSupportedWallets();
        if (!cancelled) {
          setWallets(
            supported.map((w) => ({
              id: w.id,
              name: w.name,
              isAvailable: w.isAvailable,
            }))
          );
        }
      } catch {
        if (!cancelled) {
          setWallets([
            { id: "freighter", name: "Freighter", isAvailable: true },
            { id: "albedo", name: "Albedo", isAvailable: true },
            { id: "xbull", name: "xBull", isAvailable: true },
          ]);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [mounted, isOpen]);

  if (!mounted || !isOpen) return null;

  const handleConnect = async (walletId: string) => {
    StellarWalletsKit.setWallet(walletId);
    await connect();
    onClose();
  };

  const label = (id: string) => id.replace(/[-_]/g, " ");

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0a0a0f]/80 p-4 font-mono backdrop-blur-sm">
      <div className="relative w-full max-w-md border-2 border-[#1e1e2e] bg-[#0e0e16] p-6 shadow-[8px_8px_0px_0px_#050508]">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center border-2 border-transparent text-[#6b6b80] transition hover:border-[#1e1e2e] hover:text-[#ef4444]"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </button>

        <h2 className="mb-1 text-xl font-bold uppercase tracking-wider text-[#e8e8f0]">
          Connect Wallet
        </h2>
        <p className="mb-6 text-xs font-bold uppercase tracking-wider text-[#6b6b80]">
          Select your Stellar provider
        </p>

        <div className="flex flex-col gap-3">
          {wallets.map((w) => (
            <button
              key={w.id}
              onClick={() => handleConnect(w.id)}
              disabled={!w.isAvailable}
              className="group flex w-full items-center justify-between border-2 border-[#1e1e2e] bg-[#0a0a0f] p-4 font-bold uppercase tracking-wider text-[#e8e8f0] transition hover:border-[#3b82f6] hover:bg-[#3b82f6]/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span>{w.name}</span>
              <span className="text-[10px] text-[#6b6b80] transition group-hover:text-[#3b82f6]">
                {w.isAvailable ? label(w.id) : "NOT DETECTED"}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}