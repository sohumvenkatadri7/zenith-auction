export const NETWORK = {
  rpcUrl: "https://soroban-testnet.stellar.org",
  networkPassphrase: "Test SDF Network ; September 2015",
} as const;

export const CONTRACT_ADDRESS =
  process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "";

export const STELLAR_EXPIRATION_MARGIN = 300; // seconds added to TimeBounds

/**
 * Known auction IDs stored locally.
 * The Soroban contract doesn't support iterating over stored keys,
 * so the frontend keeps a small registry of IDs to query.
 * In a production app this would be an indexer or off-chain DB.
 */
export const AUCTION_IDS_KEY = "zenith_known_auction_ids";
