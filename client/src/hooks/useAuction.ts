"use client";

import { useCallback, useRef } from "react";
import { useWalletStore } from "@/store/walletStore";
import { useAuctionStore, type AuctionDetails } from "@/store/auctionStore";
import { NETWORK, CONTRACT_ADDRESS } from "@/lib/constants";

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

/**
 * Core hook for interacting with the Auction Soroban contract.
 *
 * Provides methods for:
 *  - `createAuction`  — initialise a new auction (state-changing)
 *  - `placeBid`       — place a bid on an active auction (state-changing)
 *  - `claimWinning`   — claim the token after auction ends (state-changing)
 *  - `getAuctionDetails` — read the current auction state (read-only)
 *  - `pollBidEvents`  — poll the RPC for new `bid_placed` events
 *
 * The hook internally wires wallet auth, transaction simulation/assembly,
 * Freighter signing, and submission polling.
 */
export function useAuction() {
  const { address, signTx } = useWalletStore();
  const {
    setAuction,
    setBidHistory,
    appendBid,
    setLoading,
    setError,
    setLastPolledLedger,
  } = useAuctionStore();

  // Keep a mutable ref to the last polled ledger so the interval callback
  // always reads the most recent value without re-creating the interval.
  const lastPolledLedgerRef = useRef(0);

  // ──────────────────────────────────────────────
  //  CORE: build, simulate, sign, submit, poll
  // ──────────────────────────────────────────────

  /**
   * Submit a state-changing contract invocation.
   *
   * Steps:
   *  1. Build a Transaction with the contract call
   *  2. Simulate it via RPC to get footprint + auth entries
   *  3. Assemble the real transaction from simulation
   *  4. Sign with Freighter
   *  5. Send to RPC
   *  6. Poll until confirmed (or timeout)
   */
  const submitTx = useCallback(
    async (
      method: string,
      params: xdr.ScVal[],
    ): Promise<string> => {
      const server = getServer();
      const contract = getContract();
      const caller = address;
      if (!server || !contract || !caller)
        throw new Error("Wallet not connected or contract not configured");

      setLoading(true);
      setError(null);

      try {
        // 1. Load source account (needed for sequence number)
        const source = await server.getAccount(caller);

        // 2. Build bare transaction with the contract call
        const tx = new TransactionBuilder(source, {
          fee: BASE_FEE,
          networkPassphrase: NETWORK.networkPassphrase,
        })
          .addOperation(contract.call(method, ...params))
          .setTimeout(30)
          .build();

        // 3. Simulate (fills in footprint, auth, resource fees)
        const sim = await server.simulateTransaction(tx);

        if ("error" in sim) {
          throw new Error(`Simulation failed: ${sim.error}`);
        }

        // 4. Assemble a ready-to-sign transaction from simulation
        const assembled = assembleTransaction(tx, sim);
        const preparedTx = assembled.build();

        // 5. Sign with Freighter
        const signedXdr = await signTx(
          preparedTx.toXDR(),
          NETWORK.networkPassphrase,
        );

        // 6. Send
        const sendResult = await server.sendTransaction(
          TransactionBuilder.fromXDR(signedXdr, NETWORK.networkPassphrase),
        );

        if (sendResult.status === "PENDING") {
          // 7. Poll until confirmed
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

  /**
   * Create a new auction.
   *
   * @param creator       – wallet address of the creator
   * @param tokenAddress  – the token contract address being auctioned
   * @param startPrice    – starting price (bigint, in token's smallest unit)
   * @param minIncrement  – minimum bid increment
   * @param duration      – auction duration in seconds
   */
  const createAuction = useCallback(
    async (
      creator: string,
      tokenAddress: string,
      startPrice: bigint,
      minIncrement: bigint,
      duration: number,
    ): Promise<string> => {
      const params = [
        new Address(creator).toScVal(),
        new Address(tokenAddress).toScVal(),
        nativeToScVal(startPrice, { type: "i128" }),
        nativeToScVal(minIncrement, { type: "i128" }),
        nativeToScVal(duration, { type: "u64" }),
      ];
      return submitTx("create_auction", params);
    },
    [submitTx],
  );

  /**
   * Place a bid on an active auction.
   *
   * @param auctionId – u64 auction identifier
   * @param amount    – bid amount (bigint, smallest unit)
   */
  const placeBid = useCallback(
    async (auctionId: bigint, amount: bigint): Promise<string> => {
      const params = [
        nativeToScVal(auctionId, { type: "u64" }),
        nativeToScVal(amount, { type: "i128" }),
      ];
      return submitTx("place_bid", params);
    },
    [submitTx],
  );

  /**
   * Claim the winning token after an auction has ended.
   *
   * @param auctionId – u64 auction identifier
   */
  const claimWinning = useCallback(
    async (auctionId: bigint): Promise<string> => {
      const params = [nativeToScVal(auctionId, { type: "u64" })];
      return submitTx("claim_winning", params);
    },
    [submitTx],
  );

  // ──────────────────────────────────────────────
  //  READ METHODS
  // ──────────────────────────────────────────────

  /**
   * Fetch the current state of an auction from the contract.
   *
   * The returned `AuctionDetails` object contains all relevant fields
   * needed to render the UI (current bid, highest bidder, end time, …).
   */
  const getAuctionDetails = useCallback(
    async (auctionId: bigint): Promise<AuctionDetails | null> => {
      const server = getServer();
      const contract = getContract();
      if (!server || !contract) return null;

      setLoading(true);
      setError(null);

      try {
        // Build a read-only simulation
        const source = await server.getAccount(
          "GBZC6Y2Y7Q3ZQ2Y4QZJ2XZ3Z5YXZ6Z7Z2Y4QZJ2XZ3Z5YXZ6Z7Z2Y4",
        );
        const tx = new TransactionBuilder(source, {
          fee: BASE_FEE,
          networkPassphrase: NETWORK.networkPassphrase,
        })
          .addOperation(
            contract.call(
              "get_auction_details",
              nativeToScVal(auctionId, { type: "u64" }),
            ),
          )
          .setTimeout(30)
          .build();

        const sim = await server.simulateTransaction(tx);

        if ("error" in sim) {
          setError(`Simulation error: ${sim.error}`);
          return null;
        }

        if (!sim.result || !sim.result.retval) {
          setError("Auction not found");
          return null;
        }

        const raw = scValToNative(sim.result.retval) as Record<
          string,
          unknown
        >;

        const details: AuctionDetails = {
          creator: String(raw.creator ?? ""),
          tokenAddress: String(raw.token ?? raw.token_address ?? ""),
          startPrice: BigInt(String(raw.start_price ?? raw.startPrice ?? "0")),
          minIncrement: BigInt(
            String(raw.min_increment ?? raw.minIncrement ?? "0"),
          ),
          endTime: Number(raw.end_time ?? raw.endTime ?? 0),
          currentBid: BigInt(
            String(raw.current_bid ?? raw.currentBid ?? "0"),
          ),
          highestBidder: raw.highest_bidder
            ? String(raw.highest_bidder)
            : null,
          ended: Boolean(raw.ended ?? false),
        };

        setAuction(details);
        return details;
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Failed to fetch auction";
        setError(message);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [setAuction, setLoading, setError],
  );

  // ──────────────────────────────────────────────
  //  EVENT POLLING
  // ──────────────────────────────────────────────

  /**
   * Poll the RPC for `bid_placed` events emitted by the contract.
   *
   * Call this once (e.g. in a `useEffect`) with an interval. It
   * automatically tracks the last ledger it polled from so each call
   * only fetches new events.
   */
  const pollBidEvents = useCallback(
    async (auctionId: string): Promise<void> => {
      const server = getServer();
      if (!server) return;

      try {
        // First call — discover latest ledger and set the start point
        if (lastPolledLedgerRef.current === 0) {
          const latest = await server.getLatestLedger();
          // Go back 10 ledgers to avoid missing events from the deploy tx
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
                  // The event topic for bid_placed:
                  // Soroban events use base64-encoded ScVals.
                  // Topic[0] is the event name as a symbol.
                  nativeToScVal("bid_placed", { type: "symbol" }).toXDR("base64"),
                  "*", // wildcard for the second topic (bidder address)
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

        // Update the cursor so next poll resumes from here
        if (response.cursor) {
          lastPolledLedgerRef.current = Number(response.cursor);
          setLastPolledLedger(lastPolledLedgerRef.current);
        }
      } catch {
        // Silently ignore — polling errors are non-critical
      }
    },
    [appendBid, setLastPolledLedger],
  );

  return {
    createAuction,
    placeBid,
    claimWinning,
    getAuctionDetails,
    pollBidEvents,
  };
}
