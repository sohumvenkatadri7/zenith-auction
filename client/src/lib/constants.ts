export const NETWORK = {
  rpcUrl: "https://soroban-testnet.stellar.org",
  networkPassphrase: "Test SDF Network ; September 2015",
} as const;

export const CONTRACT_ADDRESS = "CB3MSS4J3YZCJXKP67KTUN2SR6LPPK3XZCJUSTCZ7BFSMFHBMCMY7FTY";

/** NFT Contract — NonFungibleToken (Soroban)
 * Handles mint/transfer/ownerOf for IPFS-linked assets.
 */
export const NFT_CONTRACT_ADDRESS = "CDVMGOJB2OUCJQXUKVCBMOXPQXYPTARRP4BDPZFDBIGTLGRLIIA5PB4P";

export const STELLAR_EXPIRATION_MARGIN = 300; // seconds added to TimeBounds

/**
 * Known auction IDs stored locally.
 * The Soroban contract doesn't support iterating over stored keys,
 * so the frontend keeps a small registry of IDs to query.
 * In a production app this would be an indexer or off-chain DB.
 */
export const AUCTION_IDS_KEY = "zenith_known_auction_ids";
