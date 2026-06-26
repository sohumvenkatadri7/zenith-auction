"use client";

import { useCallback, useRef } from "react";
import { useWalletStore } from "@/store/walletStore";
import { useAuctionStore, type AuctionDetails } from "@/store/auctionStore";
import {
  NETWORK,
  CONTRACT_ADDRESS,
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

/**
 * Core hook for interacting with the Auction Soroban contract.
 *
 * Provides methods for:
 *  - `initContract`   — initialise the contract (set NextId)
 *  - `createAuction`  — create a new auction
 *  - `placeBid`       — place a bid on an active auction
 *  - `claimWinning`   — claim the token after auction ends
 *  - `getAuctionDetails` — read a single auction's state
 *  - `fetchAllAuctions`  — fetch all known auctions
 *  - `pollBidEvents`  — poll the RPC for new `bid_placed` events
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

  /** Initialise the contract (sets NextId = 1). */
  const initContract = useCallback(async (): Promise<string> => {
    return submitTx("init", []);
  }, [submitTx]);

  /**
   * Create a new auction.
   *
   * @param creator       – wallet address of the creator
   * @param token         – the token contract address being auctioned
   * @param bidToken      – the token contract address used for bidding
   * @param startPrice    – starting price (bigint, in token's smallest unit)
   * @param startTime     – auction start time (unix seconds)
   * @param endTime       – auction end time (unix seconds)
   */
  const createAuction = useCallback(
    async (
      creator: string,
      token: string,
      bidToken: string,
      startPrice: bigint,
      startTime: number,
      endTime: number,
    ): Promise<bigint> => {
      const params = [
        new Address(creator).toScVal(),
        new Address(token).toScVal(),
        new Address(bidToken).toScVal(),
        nativeToScVal(startPrice, { type: "i128" }),
        nativeToScVal(startTime, { type: "u64" }),
        nativeToScVal(endTime, { type: "u64" }),
      ];
      await submitTx("create_auction", params);

      // The contract returns the new auction id, but we can't easily extract
      // it from the transaction hash. Use the known-ids list instead.
      return 0n;
    },
    [submitTx],
  );

  /** Place a bid on an active auction. */
  const placeBid = useCallback(
    async (auctionId: bigint, amount: bigint): Promise<string> => {
      const params = [
        // FIX: Contract expects bidder Address as first param
        new Address(address!).toScVal(),
        nativeToScVal(auctionId, { type: "u64" }),
        nativeToScVal(amount, { type: "i128" }),
      ];
      return submitTx("place_bid", params);
    },
    [submitTx, address],
  );

  /** Claim the winning token after an auction has ended. */
  const claimWinning = useCallback(
    async (auctionId: bigint): Promise<string> => {
      const params = [
        // FIX: Contract expects caller Address as first param
        new Address(address!).toScVal(),
        nativeToScVal(auctionId, { type: "u64" }),
      ];
      return submitTx("claim_winning", params);
    },
    [submitTx, address],
  );

  // ──────────────────────────────────────────────
  //  READ METHODS
  // ──────────────────────────────────────────────

  /**
   * Fetch the current state of a single auction from the contract.
   *
   * @param opts.manageState  – whether to update global loading/error (default true)
   */
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
        // Use a dummy source account for read-only simulation
        const source = await server.getAccount(
          "GBZC6Y2Y7Q3ZQ2Y4QZJ2XZ3Z5YXZ6Z7Z2Y4QZJ2XZ3Z5YXZ6Z7Z2Y4",
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
          if (manageState) setError(`Simulation error: ${sim.error}`);
          return null;
        }

        if (!sim.result || !sim.result.retval) {
          if (manageState) setError("Auction not found");
          return null;
        }

        const raw = scValToNative(sim.result.retval) as Record<
          string,
          unknown
        >;

        const details: AuctionDetails = {
          id: BigInt(String(raw.id ?? auctionId.toString())),
          creator: String(raw.creator ?? ""),
          token: String(raw.token ?? ""),
          bidToken: String(raw.bid_token ?? ""),
          startPrice: BigInt(String(raw.start_price ?? "0")),
          highestBid: BigInt(String(raw.highest_bid ?? "0")),
          highestBidder: String(raw.highest_bidder ?? ""),
          startTime: Number(raw.start_time ?? 0),
          endTime: Number(raw.end_time ?? 0),
          ended: Boolean(raw.ended ?? false),
          claimed: Boolean(raw.claimed ?? false),
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

  /** Fetch all known auctions from the local registry. */
  const fetchAllAuctions = useCallback(async (): Promise<AuctionDetails[]> => {
    const ids = getKnownAuctionIds();
    if (ids.length === 0) {
      setAuctions([]);
      return [];
    }

    setLoading(true);
    setError(null);

    try {
      // FIX: Pass manageState: false to avoid race conditions with inner loading toggles
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
  //  EVENT POLLING
  // ──────────────────────────────────────────────

  /** Poll the RPC for `bid_placed` events emitted by the contract. */
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
                [
                  nativeToScVal("bid_placed", { type: "symbol" }).toXDR(
                    "base64",
                  ),
                  "*",
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
    createAuction,
    placeBid,
    claimWinning,
    getAuctionDetails,
    fetchAllAuctions,
    pollBidEvents,
    addKnownAuctionId,
    getKnownAuctionIds,
  };
}
