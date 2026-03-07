import dotenv from 'dotenv';
dotenv.config();

export const RPC_URL = process.env.RPC_URL;
export const PRIVATE_KEY = process.env.PRIVATE_KEY;

export const TRADE_PERCENT = 0.02; // Max 2% of wallet per trade
export const SLIPPAGE = 0.03;      // 3% slippage