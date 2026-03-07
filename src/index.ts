import { momentumStrategy } from "./strategies/momentum.ts";
import { executeTrade } from "./bots/executor.ts";
import { createClient } from "./blockchain/solanaClient.ts";

import logger from "./utils/logger.ts";

// Example pools (replace with real ones)
const pools = [
  "FILL_THIS_WITH_POOL_PUBLIC_KEY_1",
  "FILL_THIS_WITH_POOL_PUBLIC_KEY_2"
];

async function runBot() {
  await createClient();
  for (const pool of pools) {
    await momentumStrategy(pool, 50, 2, executeTrade);
  }
}

setInterval(runBot, 60 * 1000);

logger.info("Momentum trading bot started");
