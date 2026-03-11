import logger from "../utils/logger.js";

// src/bots/executor.ts
import { executeUltraSwap } from "../blockchain/jupiterUltra.ts";
import { CircuitBreaker } from "../utils/circuitBreaker.ts";

const swapBreaker = new CircuitBreaker(3); // Trip after 3 failed attempts

export async function executeTrade({ mint, amount, isSell }) {
  try {
    // 1. Check if we are allowed to trade
    swapBreaker.check();

    logger.info(`[Executor] Attempting swap: ${amount} units...`);
    const result = await executeUltraSwap({ mint, amount, isSell });

    if (!result.success) {
      // Logic-level failure (e.g. Price moved too fast)
      throw new Error(result.error);
    }

    // 2. Success! Reset the counter
    swapBreaker.recordSuccess();
    logger.info(`[Executor] Trade Successful! Signature: ${result.signature}`);
    return result;
  } catch (error) {
    // 3. Record failure and potentially trip the breaker
    swapBreaker.recordFailure(error);

    // Optional: Send alert to Telegram/Discord here
    throw error;
  }
}
