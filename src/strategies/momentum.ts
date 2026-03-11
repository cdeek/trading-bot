import { Helius } from "helius-sdk";
import { Connection, Keypair, VersionedTransaction } from "@solana/web3.js";
import axios from "axios";
import bs58 from "bs58";
import express from "express";

// --- CONFIGURATION ---
const HELIUS_KEY = "YOUR_HELIUS_KEY";
const JUP_API_KEY = "YOUR_JUP_KEY";
const WEBHOOK_ID = "YOUR_WEBHOOK_ID";
const WALLET_KEY = Keypair.fromSecretKey(bs58.decode("YOUR_PRIVATE_KEY"));

const helius = new Helius(HELIUS_KEY);
const app = express();
app.use(express.json());

// --- STATE MANAGEMENT ---
interface Trade {
  mint: string;
  entryPrice: number;
  initialAmount: number;
  targetsReached: number; // 0: none, 1: 2x (sold 50%), 2: 3x (sold 25%)
}

const activeTrades = new Map<string, Trade>(); // Key: Pool Address
const poolVelocity = new Map<string, number[]>(); // Key: Pool Address -> Timestamps

// --- MOMENTUM DECAY CALCULATION ---
function checkDecay(pool: string): boolean {
  const now = Date.now();
  const ts = poolVelocity.get(pool) || [];
  const recent = ts.filter(t => now - t < 10000); // Last 10 seconds
  poolVelocity.set(pool, recent);

  if (ts.length < 20) return false; // Wait for data baseline

  const avg5s = (ts.filter(t => now - t < 60000).length / 60) * 5;
  const current5s = recent.filter(t => now - t < 5000).length;

  const decay = current5s / avg5s;
  console.log(`📊 Velocity Decay: ${(decay * 100).toFixed(0)}% activity`);
  return decay < 0.4; // Exit if activity drops below 40% of peak
}

// --- WEBHOOK HANDLER (THE BRAIN) ---
app.post("/helius-webhook", async (req, res) => {
  const events = req.body;

  for (const event of events) {
    const pool =
      event.events.swap?.liquidityPool || event.events.liquidity?.pool;
    if (!pool || !activeTrades.has(pool)) continue;

    const trade = activeTrades.get(pool)!;

    // 1. RUG DETECTION (Emergency Exit)
    if (event.type === "LIQUIDITY_REMOVAL") {
      console.error("🚨 RUG DETECTED! DUMPING EVERYTHING...");
      await executeUltraSell(trade.mint, "all", true);
      cleanup(pool);
      continue;
    }

    // 2. X-TARGET LOGIC (Take Profit)
    const currentPrice = event.events.swap.price;
    const profitX = currentPrice / trade.entryPrice;

    if (profitX >= 2.0 && trade.targetsReached < 1) {
      console.log("💰 2X Hit! Scaling out 50%...");
      const halfAmount = Math.floor(trade.initialAmount * 0.5).toString();
      await executeUltraSell(trade.mint, halfAmount);
      trade.targetsReached = 1;
    }

    // 3. MOMENTUM DECAY LOGIC (Trailing Stop)
    poolVelocity.get(pool)?.push(Date.now());
    if (checkDecay(pool)) {
      console.log("⚠️ Momentum dying. Closing position.");
      await executeUltraSell(trade.mint, "all");
      cleanup(pool);
    }
  }
  res.sendStatus(200);
});

// --- UTILS ---
async function cleanup(pool: string) {
  activeTrades.delete(pool);
  poolVelocity.delete(pool);
  // Optimization: Batch this with other removals to save 100-credit fee
  const webhook = await helius.getWebhookByID(WEBHOOK_ID);
  await helius.editWebhook(WEBHOOK_ID, {
    accountAddresses: webhook.accountAddresses.filter(a => a !== pool)
  });
}

app.listen(3000, () => console.log("🤖 Bot Listening on Port 3000"));
