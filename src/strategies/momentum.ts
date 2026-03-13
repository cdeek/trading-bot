
import { executeTrade } from "../bots/executor.ts";
import logger from "../utils/logger.ts";

// --- STATE MANAGEMENT ---
interface Trade {
  mint: string;
  entryPrice: number;
  initialAmount: number; // Raw BigInt format (e.g., total tokens bought)
  targetsReached: number; // 0: none, 1: 1.1x, 2: 2x, 3: 3x
  highestPrice: number;
}

export const activeTrades = new Map<string, Trade>(); // Key: Pool Address
const poolVelocity = new Map<string, number[]>(); // Key: Pool Address -> Timestamps

// --- MOMENTUM DECAY CALCULATION ---
/**
 * MOMENTUM DECAY CALCULATION
 * Logic: Compares current 5-second activity against a 45-second rolling baseline.
 * Uses a "Strike" system to prevent panic-selling on a single quiet second.
 */

let decayStrikes = new Map<string, number>(); // Tracks strikes per pool

function checkDecay(pool: string): boolean {
  const now = Date.now();
  const ts = poolVelocity.get(pool) || [];
  
  // 1. FILTER: Keep only the last 45 seconds for a responsive baseline
  const baselineWindow = ts.filter(t => now - t < 45000); 
  poolVelocity.set(pool, baselineWindow);

  // 2. BASELINE: Minimum data requirement (don't sell if there's no volume yet)
  if (baselineWindow.length < 15) return false;

  // 3. MATH: Calculate expected activity vs actual activity
  // avg5s = (Total trades in 45s / 45) * 5
  const avg5s = (baselineWindow.length / 45) * 5;
  const current5s = baselineWindow.filter(t => now - t < 5000).length;

  const decay = current5s / avg5s;
  const strikes = decayStrikes.get(pool) || 0;

  // 4. LOGIC: 35% Threshold with a 2-strike safety buffer
  if (decay < 0.35) {
    const newStrikes = strikes + 1;
    decayStrikes.set(pool, newStrikes);
    
    console.warn(`[VELOCITY] Low activity detected: ${(decay * 100).toFixed(0)}% (Strike ${newStrikes}/2)`);
    
    if (newStrikes >= 2) {
      decayStrikes.delete(pool); // Reset for next time
      return true; // TRIGGER SELL
    }
  } else {
    // Reset strikes if volume recovers above the threshold
    if (strikes > 0) decayStrikes.set(pool, 0);
  }

  return false; // HOLD
}

// --- WEBHOOK HANDLER ---
export const handleMomentum = async (events: any) => {
  for (const event of events) {
    const pool =
      event.events.swap?.liquidityPool || event.events.liquidity?.pool;
    if (!pool || !activeTrades.has(pool)) continue;

    const trade = activeTrades.get(pool)!;

    // 1. EMERGENCY RUG DETECTION
    if (event.type === "LIQUIDITY_REMOVAL") {
      logger.error("🚨 RUG DETECTED! DUMPING EVERYTHING...");
      await executeTrade({ mint: trade.mint, amount: "all", isSell: true });
      await cleanup(pool);
      continue;
    }

    // 2. SCALING TAKE PROFIT (10% MOONBAG STRATEGY)
    const currentPrice = event.events.swap?.price;
    if (!currentPrice) continue;

    if (currentPrice > trade.highestPrice) {
      trade.highestPrice = currentPrice;
    }

    const dropFromPeak =
      (trade.highestPrice - currentPrice) / trade.highestPrice;

    // TRAILING STOP: If price drops 15% from its highest point, exit.
    if (dropFromPeak >= 0.15 && trade.targetsReached >= 1) {
      logger.warn(`📉 Trailing Stop Triggered: -15% from peak. Exiting.`);
      await executeUltraSell({ mint: trade.mint, amount: "all" });
      await cleanup(pool);
      continue;
    }

    const profitX = currentPrice / trade.entryPrice;

    // Thresholds: 1.1x (Break-even), 2.0x (Double), 3.0x (Triple)
    if (profitX >= 1.1 && trade.targetsReached < 1) {
      logger.info("💰 Target 1: Selling 20% (Initial De-risk)");
      const amount = Math.floor(trade.initialAmount * 0.2).toString();
      await executeTrade({ mint: trade.mint, amount, isSell: true });
      trade.targetsReached = 1;
    } else if (profitX >= 2.0 && trade.targetsReached < 2) {
      logger.info("🚀 Target 2: Selling 30% (Securing Gains)");
      const amount = Math.floor(trade.initialAmount * 0.3).toString();
      await executeTrade({ mint: trade.mint, amount, isSell: true });
      trade.targetsReached = 2;
    } else if (profitX >= 3.0 && trade.targetsReached < 3) {
      logger.info("🌕 Target 3: Selling 40% (Secured 90% Total)");
      const amount = Math.floor(trade.initialAmount * 0.4).toString();
      await executeTrade({ mint: trade.mint, amount, isSell: true });
      trade.targetsReached = 3;
    }

    // 3. MOMENTUM DECAY LOGIC (Trailing Stop)
    const history = poolVelocity.get(pool) || [];
    history.push(Date.now());
    poolVelocity.set(pool, history);

    if (checkDecay(pool)) {
      logger.warn("⚠️ Momentum dead. Closing remaining position.");
      await executeTrade({ mint: trade.mint, amount: "all", isSell: true });
      await cleanup(pool);
    }
  }
};

// --- UTILS ---
async function cleanup(pool: string) {
  activeTrades.delete(pool);
  poolVelocity.delete(pool);
  // Optional: Add logic here to remove the address from your Helius Webhook
  // to save on credit costs (100 credits per edit).
  logger.info(`🧹 Cleaned up state for pool: ${pool}`);
}
