export const NETWORK = {
  rpcUrl: "https://soroban-testnet.stellar.org",
  networkPassphrase: "Test SDF Network ; September 2015",
} as const;

export const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "";

export const STELLAR_EXPIRATION_MARGIN = 300; // seconds added to TimeBounds
