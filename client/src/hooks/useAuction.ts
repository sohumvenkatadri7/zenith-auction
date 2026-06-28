"use client";

import { useCallback } from "react";
import { useWalletStore } from "@/store/walletStore";
import { useAuctionStore, type AuctionDetails } from "@/store/auctionStore";
import {
  NETWORK,
  CONTRACT_ADDRESS,
  NFT_CONTRACT_ADDRESS,
} from "@/lib/constants";

import {
  rpc,
  TransactionBuilder,
  BASE_FEE,
  Contract,
  nativeToScVal,
  scValToNative,
  Address,
  xdr,
  Account,
} from "@stellar/stellar-sdk";

const { Server, assembleTransaction } = rpc;

// ── Helpers ────────────────────────────────────────────────────────────
function getServer() {
  if (!NETWORK.rpcUrl) return null;
  return new Server(NETWORK.rpcUrl, { allowHttp: true });
}

function getAuctionContract() {
  return new Contract(CONTRACT_ADDRESS);
}

// ── Error Decoder ──────────────────────────────────────────────────────
function parseContractError(rawError: string, contractAddr: string): string | null {
  const match = rawError.match(/Error\(Contract,\s*#(\d+)\)/);
  if (!match) return null;
  const code = parseInt(match[1], 10);

  if (contractAddr === NFT_CONTRACT_ADDRESS) {
    switch (code) {
      case 1: return "NOT AUTHORIZED: YOU DON'T OWN THIS NFT.";
      case 2: return "NFT NOT FOUND: THIS TOKEN ID DOES NOT EXIST IN THE NFT CONTRACT.";
      case 3: return "TOKEN ALREADY EXISTS.";
      case 4: return "NFT CONTRACT NOT INITIALIZED.";
    }
  }
  if (contractAddr === CONTRACT_ADDRESS) {
    switch (code) {
      case 1: return "AUCTION NOT FOUND.";
      case 2: return "AUCTION HAS NOT ENDED.";
      case 3: return "ALREADY CLAIMED.";
      case 4: return "BID TOO LOW.";
      case 5: return "AUCTION NOT ACTIVE.";
      case 6: return "NOT THE WINNER.";
      case 7: return "NO BIDS.";
      case 8: return "HAS BIDS.";
      case 9: return "NOT ON ALLOWLIST.";
    }
  }
  return `CONTRACT ERROR #${code}.`;
}

// ── Hook ───────────────────────────────────────────────────────────────
export function useAuction() {
  const { address, signTx } = useWalletStore();
  const { setAuction, setAuctions, setLoading, setError } = useAuctionStore();

  const submitTx = useCallback(async (method: string, params: xdr.ScVal[]): Promise<string> => {
    const server = getServer();
    const contract = getAuctionContract();
    if (!server || !contract || !address) throw new Error("Wallet not connected");

    setLoading(true);
    setError(null);

    try {
      const source = await server.getAccount(address);
      const tx = new TransactionBuilder(source, {
        fee: BASE_FEE,
        networkPassphrase: NETWORK.networkPassphrase,
      })
        .addOperation(contract.call(method, ...params))
        .setTimeout(30)
        .build();

      const sim = await server.simulateTransaction(tx);
      if ("error" in sim) throw new Error(`Simulation failed: ${sim.error}`);

      const preparedTx = assembleTransaction(tx, sim).build();
      const signedXdr = await signTx(preparedTx.toXDR(), NETWORK.networkPassphrase);

      let sendResult;
      let retryCount = 0;
      const maxRetries = 3;

      while (retryCount < maxRetries) {
        sendResult = await server.sendTransaction(TransactionBuilder.fromXDR(signedXdr, NETWORK.networkPassphrase));
        if (sendResult.status !== "TRY_AGAIN_LATER") break;
        retryCount++;
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      if (!sendResult || sendResult.status === "ERROR") throw new Error("Network rejected transaction.");
      if (sendResult.status !== "PENDING") throw new Error(`Status: ${sendResult.status}`);

      const txResult = await server.pollTransaction(sendResult.hash!, { attempts: 30 });
      if (txResult.status !== "SUCCESS") throw new Error("Transaction failed");

      return txResult.txHash;
    } catch (err: any) {
      const rawMsg = err instanceof Error ? err.message : "Unknown error";
      const decoded = parseContractError(rawMsg, CONTRACT_ADDRESS);
      setError(decoded || rawMsg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [address, signTx, setLoading, setError]);

  // ── NFT Approval ────────────────────────────────────────────────────
  const approveNft = useCallback(async (tokenAddress: string, tokenId: bigint): Promise<string> => {
      const server = getServer();
      if (!server || !address) throw new Error("Wallet not connected");
      const nftContract = new Contract(tokenAddress);

      // ── Pre-flight: verify user actually owns the NFT ──
      try {
        const dummySource = new Account("GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF", "0");
        const ownerTx = new TransactionBuilder(dummySource, { fee: BASE_FEE, networkPassphrase: NETWORK.networkPassphrase })
          .addOperation(nftContract.call("owner_of", nativeToScVal(tokenId, { type: "i128" })))
          .setTimeout(30).build();
        const ownerSim = await server.simulateTransaction(ownerTx);
        if ("result" in ownerSim && ownerSim.result?.retval) {
          const ownerAddr = scValToNative(ownerSim.result.retval);
          if (String(ownerAddr) !== address) {
            throw new Error(`NOT AUTHORIZED: YOU DON'T OWN THIS NFT. Owner is ${String(ownerAddr)}, you are ${address}.`);
          }
        }
      } catch (preErr: any) {
        if (preErr?.message?.includes("NOT AUTHORIZED")) throw preErr;
        // If the NFT doesn't exist at all, owner_of will fail — fall through to approve to get the real error
      }

      const source = await server.getAccount(address);
      const tx = new TransactionBuilder(source, { fee: BASE_FEE, networkPassphrase: NETWORK.networkPassphrase })
        .addOperation(nftContract.call("approve", new Address(address).toScVal(), new Address(CONTRACT_ADDRESS).toScVal(), nativeToScVal(tokenId, { type: "i128" })))
        .setTimeout(30).build();
      const sim = await server.simulateTransaction(tx);
      if ("error" in sim) {
        // Decode the simulation error into a human-readable message
        const simError = typeof sim.error === "string" ? sim.error : JSON.stringify(sim.error);
        const decoded = parseContractError(simError, tokenAddress);
        throw new Error(decoded || `APPROVE FAILED: ${simError}`);
      }
      const signedXdr = await signTx(assembleTransaction(tx, sim).build().toXDR(), NETWORK.networkPassphrase);
      const sendResult = await server.sendTransaction(TransactionBuilder.fromXDR(signedXdr, NETWORK.networkPassphrase));
      const txResult = await server.pollTransaction(sendResult.hash!, { attempts: 30 });
      return txResult.txHash;
  }, [address, signTx]);

  // ── PURE BLOCKCHAIN-DRIVEN DISCOVERY ─────────────────────────────────
  const fetchAllAuctions = useCallback(async () => {
    const server = getServer();
    const contract = getAuctionContract();
    if (!server || !contract) return;

    setLoading(true);
    try {
      const dummySource = new Account("GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF", "0");
      const tx = new TransactionBuilder(dummySource, { fee: BASE_FEE, networkPassphrase: NETWORK.networkPassphrase })
        .addOperation(contract.call("get_next_id"))
        .setTimeout(30)
        .build();
      
      const sim = await server.simulateTransaction(tx);
      const nextId = "result" in sim && sim.result?.retval ? Number(scValToNative(sim.result.retval)) : 1;

      const auctionPromises = [];
      for (let i = 1; i < nextId; i++) {
        auctionPromises.push(getAuctionDetails(BigInt(i), { manageState: false }));
      }

      const results = await Promise.all(auctionPromises);
      const activeAuctions = results.filter((a): a is AuctionDetails => a !== null);
      setAuctions(activeAuctions);
    } catch (err) {
      console.error("SYNC FAILED:", err);
    } finally {
      setLoading(false);
    }
  }, [setAuctions, setLoading]);

  const getAuctionDetails = useCallback(async (auctionId: bigint, opts: { manageState?: boolean } = {}): Promise<AuctionDetails | null> => {
    const manageState = opts.manageState ?? true;
    const server = getServer();
    const contract = getAuctionContract();
    if (!server || !contract) return null;

    if (manageState) {
      setLoading(true);
      setError(null);
    }

    try {
      const dummySource = new Account("GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF", "0");
      const tx = new TransactionBuilder(dummySource, { fee: BASE_FEE, networkPassphrase: NETWORK.networkPassphrase })
        .addOperation(contract.call("get_auction", nativeToScVal(auctionId, { type: "u64" })))
        .setTimeout(30)
        .build();

      const sim = await server.simulateTransaction(tx);
      if (!("result" in sim) || !sim.result?.retval) {
        if (manageState) setError(`AUCTION #${auctionId} NOT FOUND`);
        return null;
      }

      const raw = scValToNative(sim.result.retval) as Record<string, any>;
      const details: AuctionDetails = {
        id: BigInt(raw.id),
        creator: String(raw.creator),
        token: String(raw.token),
        token_id: BigInt(raw.token_id),
        bidToken: String(raw.bid_token),
        startPrice: BigInt(raw.start_price),
        minBidIncrement: BigInt(raw.min_bid_increment), // NEW: parsed from contract
        highestBid: BigInt(raw.highest_bid),
        highestBidder: String(raw.highest_bidder),
        startTime: Number(raw.start_time),
        endTime: Number(raw.end_time),
        ended: Boolean(raw.ended),
        claimed: Boolean(raw.claimed),
        isPrivate: Boolean(raw.is_private),
        allowlist: (raw.allowlist || []).map((a: any) => String(a)),
      };

      if (manageState) setAuction(details);
      return details;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to fetch auction";
      if (manageState) setError(message);
      return null;
    } finally {
      if (manageState) setLoading(false);
    }
  }, [setAuction, setLoading, setError]);

  // ── WRITE METHODS ────────────────────────────────────────────────────
  const createAuction = useCallback(async (
    creator: string, 
    token: string, 
    tokenId: bigint, 
    bidToken: string, 
    startPrice: bigint, 
    minBidIncrement: bigint, // NEW PARAM: minimum bid increment
    startTime: number, 
    endTime: number, 
    isPrivate: boolean, 
    allowlist: string[]
  ): Promise<string> => {
      // 1. Approve auction contract to transfer the NFT (harmless if already approved)
      if (token === NFT_CONTRACT_ADDRESS) {
        await approveNft(token, tokenId);
      }

      // 2. Submit Auction — params order matches Rust create_auction signature
      const params = [
        new Address(creator).toScVal(), 
        new Address(token).toScVal(), 
        nativeToScVal(tokenId, { type: "i128" }), 
        new Address(bidToken).toScVal(), 
        nativeToScVal(startPrice, { type: "i128" }), 
        nativeToScVal(minBidIncrement, { type: "i128" }), // NEW: matches Rust param order
        nativeToScVal(startTime, { type: "u64" }), 
        nativeToScVal(endTime, { type: "u64" }), 
        xdr.ScVal.scvBool(isPrivate), 
        xdr.ScVal.scvVec(allowlist.map(addr => new Address(addr).toScVal()))
      ];
      return submitTx("create_auction", params);
  }, [submitTx, approveNft]);

  const placeBid = useCallback(async (auctionId: bigint, amount: bigint): Promise<string> => {
    return submitTx("place_bid", [
      new Address(address!).toScVal(),
      nativeToScVal(auctionId, { type: "u64" }),
      nativeToScVal(amount, { type: "i128" }),
    ]);
  }, [submitTx, address]);

  const claimWinning = useCallback(async (auctionId: bigint): Promise<string> => {
    return submitTx("claim_winning", [nativeToScVal(auctionId, { type: "u64" })]);
  }, [submitTx]);

  const reclaimUnsold = useCallback(async (auctionId: bigint): Promise<string> => {
    return submitTx("reclaim_unsold", [nativeToScVal(auctionId, { type: "u64" })]);
  }, [submitTx]);

  // ── CANCEL AUCTION (new) ────────────────────────────────────────
  const cancelAuction = useCallback(async (auctionId: bigint): Promise<string> => {
    return submitTx("cancel_auction", [nativeToScVal(auctionId, { type: "u64" })]);
  }, [submitTx]);

  const getTokenBalance = useCallback(async (tokenAddress: string, holderAddress: string): Promise<bigint | null> => {
      const server = getServer();
      if (!server) return null;
      try {
        const tokenContract = new Contract(tokenAddress);
        const dummySource = new Account("GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF", "0");
        const tx = new TransactionBuilder(dummySource, { fee: BASE_FEE, networkPassphrase: NETWORK.networkPassphrase })
          .addOperation(tokenContract.call("balance", new Address(holderAddress).toScVal()))
          .setTimeout(30)
          .build();
        const sim = await server.simulateTransaction(tx);
        return "result" in sim && sim.result?.retval ? BigInt(String(scValToNative(sim.result.retval))) : null;
      } catch { return null; }
  }, []);

  // ── GET NEXT AUCTION ID ──────────────────────────────────────────
  const getNextId = useCallback(async (): Promise<number> => {
    const server = getServer();
    const contract = getAuctionContract();
    if (!server || !contract) return 1;
    try {
      const dummySource = new Account("GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF", "0");
      const tx = new TransactionBuilder(dummySource, { fee: BASE_FEE, networkPassphrase: NETWORK.networkPassphrase })
        .addOperation(contract.call("get_next_id"))
        .setTimeout(30)
        .build();
      const sim = await server.simulateTransaction(tx);
      return "result" in sim && sim.result?.retval ? Number(scValToNative(sim.result.retval)) : 1;
    } catch {
      return 1;
    }
  }, []);

  return { createAuction, fetchAllAuctions, getAuctionDetails, placeBid, claimWinning, reclaimUnsold, cancelAuction, getTokenBalance, getNextId };
}