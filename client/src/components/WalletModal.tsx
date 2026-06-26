"use client";

import { X } from "lucide-react";
import { useWalletStore } from "@/store/walletStore";
import { useEffect, useState } from "react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function WalletModal({ isOpen, onClose }: Props) {
  const { connect } = useWalletStore();
  const [mounted, setMounted] = useState(false);

  // Prevent hydration mismatch errors
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !isOpen) return null;

  const handleConnect = async (walletId: string) => {
    await connect(walletId);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0a0a0f]/80 p-4 font-mono backdrop-blur-sm">
      <div className="relative w-full max-w-md border-2 border-[#1e1e2e] bg-[#0e0e16] p-6 shadow-[8px_8px_0px_0px_#050508]">
        
        <button
          onClick={onClose}
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center border-2 border-transparent text-[#6b6b80] transition hover:border-[#1e1e2e] hover:text-[#ef4444]"
        >
          <X className="h-5 w-5" />
        </button>

        <h2 className="mb-1 text-xl font-bold uppercase tracking-wider text-[#e8e8f0]">
          Connect Wallet
        </h2>
        <p className="mb-6 text-xs font-bold uppercase tracking-wider text-[#6b6b80]">
          Select your Stellar provider
        </p>

        <div className="flex flex-col gap-3">
          <button
            onClick={() => handleConnect("freighter")}
            className="group flex w-full items-center justify-between border-2 border-[#1e1e2e] bg-[#0a0a0f] p-4 font-bold uppercase tracking-wider text-[#e8e8f0] transition hover:border-[#3b82f6] hover:bg-[#3b82f6]/10"
          >
            <span>Freighter</span>
            <span className="text-[10px] text-[#6b6b80] transition group-hover:text-[#3b82f6]">Extension</span>
          </button>

          <button
            onClick={() => handleConnect("xbull")}
            className="group flex w-full items-center justify-between border-2 border-[#1e1e2e] bg-[#0a0a0f] p-4 font-bold uppercase tracking-wider text-[#e8e8f0] transition hover:border-[#3b82f6] hover:bg-[#3b82f6]/10"
          >
            <span>xBull</span>
            <span className="text-[10px] text-[#6b6b80] transition group-hover:text-[#3b82f6]">Extension / Mobile</span>
          </button>

          <button
            onClick={() => handleConnect("albedo")}
            className="group flex w-full items-center justify-between border-2 border-[#1e1e2e] bg-[#0a0a0f] p-4 font-bold uppercase tracking-wider text-[#e8e8f0] transition hover:border-[#3b82f6] hover:bg-[#3b82f6]/10"
          >
            <span>Albedo</span>
            <span className="text-[10px] text-[#6b6b80] transition group-hover:text-[#3b82f6]">Web Wallet</span>
          </button>
        </div>
        
      </div>
    </div>
  );
}