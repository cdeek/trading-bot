const config = {
  // Solana RPC & API Endpoints
  SOLANA_RPC: "https://api.miannet-better.solana.com",
  JUPITER_QUOTE_API: "https://api.jup.ag/swap/v1/quote",
  JUPITER_SWAP_API: "https://api.jup.ag/swap/v1/swap",
  DEXSCREENER_API: "https://api.dexscreener.com/token-profiles/latest/v1",
  DEXSCREENER_API_SOL: "https://api.dexscreener.com/tokens/v1/solana/",
  RUGCHECK_API: "https://api.rugcheck.xyz/tokens/", // Replae with actual RugCheck API

  // Trade Settings
  tradeAmount: 1000000, // Amount in smallest unit (e.g., lamports)
  tradeThreshold: 10, // Minimum expected output before executing a trade
  pollInterval: 30000, // Polling interval in milliseconds

  // Security Parameters
  rugScoreThreshold: 5, // Max acceptable rug score
  minLiquidity: 50000, // Minimum liquidity in USD to consider trading
  minVolume: 100000, // Minimum 24h trading volume

  // WebSocket & Dashboard Config
  SOCKET_PORT: process.env.PORT || 3000,
};

export default config;
