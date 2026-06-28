export const NETWORK = {
  rpcUrl: "https://soroban-testnet.stellar.org",
  networkPassphrase: "Test SDF Network ; September 2015",
} as const;

//export const CONTRACT_ADDRESS = "CCOSMOPZS6HEHXE5LUYAKLZF64LBJ4AJWCEJIPJFYODDP6QJ6EA7XMUX";
  export const CONTRACT_ADDRESS = "CAFCTYRQ3IWAF74IQ4UO5IIITZL45S5T4FED5UU5763Y74MND3LW7GBY";
/** NFT Contract — NonFungibleToken (Soroban)
 * Handles mint/transfer/ownerOf for IPFS-linked assets.
 */
export const NFT_CONTRACT_ADDRESS = "CBZ5N4CUKQE5HNF5LM4VTY3YFJPN73FOXGYLTLXJJTDHE5UQYQJXSKB6";

/** Default bidding token used for balance display in the Navbar. */
export const DEFAULT_BID_TOKEN = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC"; // XLM (Stellar Asset Contract)

export const STELLAR_EXPIRATION_MARGIN = 300; // seconds added to TimeBounds

/**
 * Known auction IDs stored locally.
 * The Soroban contract doesn't support iterating over stored keys,
 * so the frontend keeps a small registry of IDs to query.
 * In a production app this would be an indexer or off-chain DB.
 */
export const AUCTION_IDS_KEY = "zenith_known_auction_ids";
