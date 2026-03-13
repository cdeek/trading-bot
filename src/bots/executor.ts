import logger from "../utils/logger.ts";

// src/bots/executor.ts
import { executeUltraSwap } from "../blockchain/jupiterUltra.ts";
import { CircuitBreaker } from "../utils/circuitBreaker.ts";
import { getTradeAmount } from "../utils/riskManager.ts";
import { sendNotification } from "../bots/telegram.ts";
import { activeTrades } from "../strategies/momentum.ts";

const swapBreaker = new CircuitBreaker(3); // Trip after 3 failed attempts

export async function executeTrade({ mint, amount, isSell }) {
  try {
    // 1. Check if we are allowed to trade
    swapBreaker.check();
    const tradeAmount = isSell ? amount : await getTradeAmount();

    logger.info(`[Executor] Attempting swap: ${tradeAmount} units...`);
    const result = await executeUltraSwap({
      mint,
      amount: tradeAmount,
      isSell
    });

    if (!result.success) {
      // Logic-level failure (e.g. Price moved too fast)
      throw new Error(result.error);
    }

    // activeTrades.set(pool, {
    //   mint: mint,
    //   entryPrice: 0.0001,
    //   initialAmount: 1000000,
    //   targetsReached: 0,
    //   highestPrice: 0
    // });

    // 2. Success! Reset the counter
    swapBreaker.recordSuccess();
    logger.info(`[Executor] Trade Successful! Signature: ${result.signature}`);
    return result;
  } catch (error) {
    // 3. Record failure and potentially trip the breaker
    swapBreaker.recordFailure(error);
  }
}
