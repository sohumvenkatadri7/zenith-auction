export const NETWORK = {
  rpcUrl: "https://soroban-testnet.stellar.org",
  networkPassphrase: "Test SDF Network ; September 2015",
} as const;

//export const CONTRACT_ADDRESS = "CCOSMOPZS6HEHXE5LUYAKLZF64LBJ4AJWCEJIPJFYODDP6QJ6EA7XMUX";
  export const CONTRACT_ADDRESS = "CDHAI6RJFY7BDKMIRD3UNA4ECM5DTFHC2BIN37IHR3ZLPYZ4HCEQNWJJ";
/** NFT Contract — NonFungibleToken (Soroban)
 * Handles mint/transfer/ownerOf for IPFS-linked assets.
 */
//export const NFT_CONTRACT_ADDRESS = "CBZ5N4CUKQE5HNF5LM4VTY3YFJPN73FOXGYLTLXJJTDHE5UQYQJXSKB6";
export const NFT_CONTRACT_ADDRESS = "CACT6424F6G334LL3ECNTCKL533SYV2BNCCVI2OK3SNP4HCLSU2GROAS";


/** Default bidding token used for balance display in the Navbar. */
export const DEFAULT_BID_TOKEN = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC"; // XLM (Stellar Asset Contract)

export const STELLAR_EXPIRATION_MARGIN = 300; // seconds added to TimeBounds


export const AUCTION_IDS_KEY = "zenith_known_auction_ids";
