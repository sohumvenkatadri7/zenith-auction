"use client";

import { useCallback, useRef } from "react";
import { useWalletStore } from "@/store/walletStore";
import { useAuctionStore, type AuctionDetails } from "@/store/auctionStore";
import {
  NETWORK,
  CONTRACT_ADDRESS,
  NFT_CONTRACT_ADDRESS,
  AUCTION_IDS_KEY,
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

/**
 * Attempts to create a Soroban RPC server connection.
 * Returns `null` if no URL is configured (graceful fallback).
 */
function getServer() {
  if (!NETWORK.rpcUrl) return null;
  return new Server(NETWORK.rpcUrl, { allowHttp: true });
}

/**
 * Attempts to create a Contract instance from the configured address.
 * Returns `null` if no address is set.
 */
function getContract(): Contract | null {
  if (!CONTRACT_ADDRESS) return null;
  return new Contract(CONTRACT_ADDRESS);
}

// ── Local auction ID registry ──────────────────────────────────────

function getKnownAuctionIds(): bigint[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(AUCTION_IDS_KEY);
    if (!raw) return [];
    return JSON.parse(raw).map((id: string) => BigInt(id));
  } catch {
    return [];
  }
}

function addKnownAuctionId(id: bigint) {
  if (typeof window === "undefined") return;
  const ids = getKnownAuctionIds();
  const idStr = id.toString();
  if (!ids.some((i) => i.toString() === idStr)) {
    ids.push(id);
    localStorage.setItem(
      AUCTION_IDS_KEY,
      JSON.stringify(ids.map((i) => i.toString())),
    );
  }
}

function removeKnownAuctionId(id: bigint) {
  if (typeof window === "undefined") return;
  const ids = getKnownAuctionIds();
  const filtered = ids.filter((i) => i.toString() !== id.toString());
  localStorage.setItem(
    AUCTION_IDS_KEY,
    JSON.stringify(filtered.map((i) => i.toString())),
  );
}

/**
 * Core hook for interacting with the Auction Soroban contract.
 */
export function useAuction() {
  const { address, signTx } = useWalletStore();
  const {
    setAuction,
    setAuctions,
    appendBid,
    setLoading,
    setError,
    setLastPolledLedger,
  } = useAuctionStore();

  const lastPolledLedgerRef = useRef(0);

  // ──────────────────────────────────────────────
  //  CORE: build, simulate, sign, submit
  // ──────────────────────────────────────────────

  const submitTx = useCallback(
    async (method: string, params: xdr.ScVal[]): Promise<string> => {
      const server = getServer();
      const contract = getContract();
      const caller = address;
      
      if (!server || !contract || !caller)
        throw new Error("Wallet not connected or contract not configured");

      setLoading(true);
      setError(null);

      try {
        const source = await server.getAccount(caller);

        const tx = new TransactionBuilder(source, {
          fee: BASE_FEE,
          networkPassphrase: NETWORK.networkPassphrase,
        })
          .addOperation(contract.call(method, ...params))
          .setTimeout(30)
          .build();

        const sim = await server.simulateTransaction(tx);

        if ("error" in sim) {
          throw new Error(`Simulation failed: ${sim.error}`);
        }

        const assembled = assembleTransaction(tx, sim);
        const preparedTx = assembled.build();

        // Using the global kit from the store for multi-wallet support
        const signedXdr = await signTx(
          preparedTx.toXDR(),
          NETWORK.networkPassphrase,
        );

        const sendResult = await server.sendTransaction(
          TransactionBuilder.fromXDR(signedXdr, NETWORK.networkPassphrase),
        );

        if (sendResult.status === "PENDING") {
          const txResult = await server.pollTransaction(sendResult.hash, {
            attempts: 30,
          });

          if (txResult.status !== "SUCCESS") {
            const detail =
              "resultXdr" in txResult
                ? String(txResult.resultXdr)
                : "no result available";
            throw new Error(
              `Transaction failed: ${txResult.status} — ${detail}`,
            );
          }

          return txResult.txHash;
        }

        throw new Error(
          `Send returned unexpected status: ${sendResult.status}`,
        );
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Unknown transaction error";
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [address, signTx, setLoading, setError],
  );

  // ──────────────────────────────────────────────
  //  WRITE METHODS
  // ──────────────────────────────────────────────

  const initContract = useCallback(async (): Promise<string> => {
    return submitTx("init", []);
  }, [submitTx]);

  const approveNft = useCallback(
    async (tokenAddress: string, tokenId: bigint): Promise<string> => {
      const server = getServer();
      if (!server || !address) throw new Error("Wallet not connected");

      const nftContract = new Contract(tokenAddress);
      const source = await server.getAccount(address);

      const tx = new TransactionBuilder(source, {
        fee: BASE_FEE,
        networkPassphrase: NETWORK.networkPassphrase,
      })
        .addOperation(
          nftContract.call(
            "approve",
            new Address(address).toScVal(),
            new Address(CONTRACT_ADDRESS).toScVal(),
            nativeToScVal(tokenId, { type: "i128" }),
          ),
        )
        .setTimeout(30)
        .build();

      const sim = await server.simulateTransaction(tx);
      if ("error" in sim) {
        throw new Error(`Approve simulation failed: ${sim.error}`);
      }

      const assembled = assembleTransaction(tx, sim);
      const signedXdr = await signTx(
        assembled.build().toXDR(),
        NETWORK.networkPassphrase,
      );

      const sendResult = await server.sendTransaction(
        TransactionBuilder.fromXDR(signedXdr, NETWORK.networkPassphrase),
      );

      if (sendResult.status === "PENDING") {
        const txResult = await server.pollTransaction(sendResult.hash, {
          attempts: 30,
        });
        if (txResult.status !== "SUCCESS") {
          const detail =
            "resultXdr" in txResult ? String(txResult.resultXdr) : "no result";
          throw new Error(`Approve failed: ${txResult.status} — ${detail}`);
        }
        return txResult.txHash;
      }
      throw new Error(`Approve send returned: ${sendResult.status}`);
    },
    [address, signTx],
  );

  const createAuction = useCallback(
    async (
      creator: string,
      token: string,
      tokenId: bigint,
      bidToken: string,
      startPrice: bigint,
      startTime: number,
      endTime: number,
      isPrivate: boolean,
      allowlist: string[],
    ): Promise<bigint> => {
      // If the token is the NFT contract, approve the auction contract to transfer first
      if (token === NFT_CONTRACT_ADDRESS) {
        await approveNft(token, tokenId);
      }

      // Format allowlist as a Soroban Vec<Address> using XDR directly
      const allowlistScVals = allowlist.map((addr) => new Address(addr).toScVal());
      const allowlistVec = xdr.ScVal.scvVec(allowlistScVals);

      // Contract param order: creator, token, token_id, bid_token, start_price, start_time, end_time, is_private, allowlist
      const params = [
        new Address(creator).toScVal(),
        new Address(token).toScVal(),
        nativeToScVal(tokenId, { type: "i128" }),
        new Address(bidToken).toScVal(),
        nativeToScVal(startPrice, { type: "i128" }),
        nativeToScVal(startTime, { type: "u64" }),
        nativeToScVal(endTime, { type: "u64" }),
        xdr.ScVal.scvBool(isPrivate),
        allowlistVec,
      ];
      await submitTx("create_auction", params);
      return 0n;
    },
    [submitTx, approveNft],
  );

  const placeBid = useCallback(
    async (auctionId: bigint, amount: bigint): Promise<string> => {
      const params = [
        new Address(address!).toScVal(),
        nativeToScVal(auctionId, { type: "u64" }),
        nativeToScVal(amount, { type: "i128" }),
      ];
      return submitTx("place_bid", params);
    },
    [submitTx, address],
  );

  const claimWinning = useCallback(
    async (auctionId: bigint): Promise<string> => {
      const params = [
        nativeToScVal(auctionId, { type: "u64" }),
      ];
      return submitTx("claim_winning", params);
    },
    [submitTx],
  );

  const reclaimUnsold = useCallback(
    async (auctionId: bigint): Promise<string> => {
      const params = [
        nativeToScVal(auctionId, { type: "u64" }),
      ];
      return submitTx("reclaim_unsold", params);
    },
    [submitTx],
  );

  // ──────────────────────────────────────────────
  //  READ METHODS
  // ──────────────────────────────────────────────

  const getAuctionDetails = useCallback(
    async (
      auctionId: bigint,
      opts: { manageState?: boolean } = {},
    ): Promise<AuctionDetails | null> => {
      const manageState = opts.manageState ?? true;
      const server = getServer();
      const contract = getContract();
      if (!server || !contract) return null;

      if (manageState) {
        setLoading(true);
        setError(null);
      }

      try {
        // FIX: Construct a local dummy account to bypass the Horizon 404 error entirely
        const source = new Account(
          "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF", 
          "0"
        );

        const tx = new TransactionBuilder(source, {
          fee: BASE_FEE,
          networkPassphrase: NETWORK.networkPassphrase,
        })
          .addOperation(
            contract.call(
              "get_auction",
              nativeToScVal(auctionId, { type: "u64" }),
            ),
          )
          .setTimeout(30)
          .build();

        const sim = await server.simulateTransaction(tx);

        if ("error" in sim) {
          const errMsg = String(sim.error ?? "");
          // Detect contract NotFound (Error(Contract, #1)) — auction doesn't exist on-chain
          const isNotFound = /Error\(Contract,\s*#1\)/i.test(errMsg);
          if (isNotFound) {
            // Clean up stale ID from localStorage registry
            removeKnownAuctionId(auctionId);
          }
          if (manageState) {
            setError(isNotFound ? `AUCTION #${auctionId} DOES NOT EXIST ON-CHAIN` : `Simulation error: ${errMsg}`);
          }
          return null;
        }

        if (!sim.result || !sim.result.retval) {
          if (manageState) setError("Auction not found");
          return null;
        }

        const raw = scValToNative(sim.result.retval) as Record<string, unknown>;

        const details: AuctionDetails = {
          id: BigInt(String(raw.id ?? auctionId.toString())),
          creator: String(raw.creator ?? ""),
          token: String(raw.token ?? ""),
          token_id: BigInt(String(raw.token_id ?? "0")),
          bidToken: String(raw.bid_token ?? ""),
          startPrice: BigInt(String(raw.start_price ?? "0")),
          highestBid: BigInt(String(raw.highest_bid ?? "0")),
          highestBidder: String(raw.highest_bidder ?? ""),
          startTime: Number(raw.start_time ?? 0),
          endTime: Number(raw.end_time ?? 0),
          ended: Boolean(raw.ended ?? false),
          claimed: Boolean(raw.claimed ?? false),
          isPrivate: Boolean(raw.is_private ?? false),
          allowlist: Array.isArray(raw.allowlist)
            ? raw.allowlist.map((addr: unknown) => String(addr))
            : [],
        };

        setAuction(details);
        return details;
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Failed to fetch auction";
        if (manageState) setError(message);
        return null;
      } finally {
        if (manageState) setLoading(false);
      }
    },
    [setAuction, setLoading, setError],
  );

  const fetchAllAuctions = useCallback(async (): Promise<AuctionDetails[]> => {
    const ids = getKnownAuctionIds();
    if (ids.length === 0) {
      setAuctions([]);
      return [];
    }

    setLoading(true);
    setError(null);

    try {
      const results = await Promise.allSettled(
        ids.map((id) => getAuctionDetails(id, { manageState: false })),
      );

      const auctions = results
        .filter(
          (r): r is PromiseFulfilledResult<AuctionDetails> =>
            r.status === "fulfilled" && r.value !== null,
        )
        .map((r) => r.value);

      setAuctions(auctions);
      return auctions;
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch auctions";
      setError(message);
      return [];
    } finally {
      setLoading(false);
    }
  }, [getAuctionDetails, setAuctions, setLoading, setError]);

  // ──────────────────────────────────────────────
  //  TOKEN BALANCE QUERY
  // ──────────────────────────────────────────────

  const getTokenBalance = useCallback(
    async (tokenAddress: string, holderAddress: string): Promise<bigint | null> => {
      const server = getServer();
      if (!server) return null;
      try {
        const tokenContract = new Contract(tokenAddress);
        const source = new Account(
          "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
          "0",
        );
        const tx = new TransactionBuilder(source, {
          fee: BASE_FEE,
          networkPassphrase: NETWORK.networkPassphrase,
        })
          .addOperation(
            tokenContract.call(
              "balance",
              new Address(holderAddress).toScVal(),
            ),
          )
          .setTimeout(30)
          .build();
        const sim = await server.simulateTransaction(tx);
        if ("error" in sim || !sim.result?.retval) return null;
        return BigInt(String(scValToNative(sim.result.retval)));
      } catch {
        return null;
      }
    },
    [],
  );

  // ──────────────────────────────────────────────
  //  EVENT POLLING
  // ──────────────────────────────────────────────

  const pollBidEvents = useCallback(
    async (auctionId: string): Promise<void> => {
      const server = getServer();
      if (!server) return;

      try {
        if (lastPolledLedgerRef.current === 0) {
          const latest = await server.getLatestLedger();
          lastPolledLedgerRef.current = Math.max(1, latest.sequence - 10);
          setLastPolledLedger(lastPolledLedgerRef.current);
          return;
        }

        const response = await server.getEvents({
          startLedger: lastPolledLedgerRef.current,
          filters: [
            {
              type: "contract",
              contractIds: [CONTRACT_ADDRESS],
              topics: [
                // Fixed wildcard bug: Only pass the exact symbol
                [
                  nativeToScVal("bid_placed", { type: "symbol" }).toXDR(
                    "base64",
                  ),
                ],
              ],
            },
          ],
          limit: 100,
        });

        if (response.events.length > 0) {
          for (const evt of response.events) {
            const value = scValToNative(evt.value) as Record<string, unknown>;
            appendBid({
              auctionId: String(value.auction_id ?? auctionId),
              bidder: String(value.bidder ?? ""),
              amount: String(value.amount ?? "0"),
              timestamp: Date.now(),
            });
          }
        }

        if (response.cursor) {
          lastPolledLedgerRef.current = Number(response.cursor);
          setLastPolledLedger(lastPolledLedgerRef.current);
        }
      } catch {
        // Polling errors are non-critical
      }
    },
    [appendBid, setLastPolledLedger],
  );

  return {
    initContract,
    approveNft,
    createAuction,
    placeBid,
    claimWinning,
    reclaimUnsold,
    getAuctionDetails,
    fetchAllAuctions,
    pollBidEvents,
    getTokenBalance,
    addKnownAuctionId,
    removeKnownAuctionId,
    getKnownAuctionIds,
  };
}