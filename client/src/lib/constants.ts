export const NETWORK = {
  rpcUrl: "https://soroban-testnet.stellar.org",
  networkPassphrase: "Test SDF Network ; September 2015",
} as const;

export const CONTRACT_ADDRESS = "CA46B2LHS67SLQGONAF3OPSQEZN5KXI26I2YH6SQTXWX75SV5S5JQPSW" ;

export const STELLAR_EXPIRATION_MARGIN = 300; // seconds added to TimeBounds

/**
 * Known auction IDs stored locally.
 * The Soroban contract doesn't support iterating over stored keys,
 * so the frontend keeps a small registry of IDs to query.
 * In a production app this would be an indexer or off-chain DB.
 */
export const AUCTION_IDS_KEY = "zenith_known_auction_ids";
