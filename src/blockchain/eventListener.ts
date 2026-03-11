import {
  isSolanaError,
  SOLANA_ERROR__RPC_SUBSCRIPTIONS__CHANNEL_CONNECTION_CLOSED
} from "@solana/kit";

import { runSnipingStrategy } from "../strategies/sniping.ts";
import { runWhaleStrategy } from "../strategies/walletTracking.ts"; // Fixed import
import logger from "../utils/logger.ts";
import { TARGETS } from "../../config/config.ts";
import { client } from "./solanaClient.ts";

async function startMonitoring() {
  const controller = new AbortController();

  try {
    // We iterate through TARGETS.
    // WARNING: Helius Free Tier has a limit of 5 concurrent WSS connections.
    for (const target of TARGETS) {
      const sub = await client.rpcSubscriptions
        .logsNotifications(
          { mentions: [target.addr] }, // target.addr should be the Program ID or Wallet
          { commitment: "processed" }
        )
        .subscribe({ abortSignal: controller.signal });

      logger.info(`📡 Monitoring ${target.name} via Helius WSS`);

      // Using a dedicated listener per subscription
      (async () => {
        try {
          for await (const notification of sub) {
            if (notification.value.err) continue;

            const sig = notification.value.signature;
            const logs = notification.value.logs;

            handleTransaction(sig, logs, target.name);
          }
        } catch (err) {
          handleWssError(err);
        }
      })();
    }
  } catch (err) {
    handleWssError(err);
  }
}

function handleTransaction(sig: string, logs: string[], target: string) {
  // 2026 Pattern Matching
  const logString = logs.join(" ");

  switch (target) {
    case "PumpFun":
      // 2026 Migration Logic: Pump.fun -> PumpSwap
      if (logString.includes("Instruction: Migrate")) {
        logger.info(`✨ PumpSwap Migration Detected: ${sig}`);
        runSnipingStrategy(sig, "PUMPSWAP_GRAD");
      }
      break;

    case "Raydium":
      // CPMM is the standard in 2026, replacing AMM v4
      if (
        logString.includes("initialize2") ||
        logString.includes("CreatePool")
      ) {
        logger.info(`🌊 Raydium CPMM Pool Created: ${sig}`);
        runSnipingStrategy(sig, "RAYDIUM_CPMM_GRAD");
      }
      break;

    case "Whale1":
      // Monitoring specific whale movements or Jupiter swaps
      if (/Create|Swap|Jupiter|Route/i.test(logString)) {
        logger.info(`🐋 Whale Move Detected: ${sig}`);
        runWhaleStrategy(sig, "WHALE_MOVE");
      }
      break;
  }
}

function handleWssError(err: unknown) {
  if (
    isSolanaError(
      err,
      SOLANA_ERROR__RPC_SUBSCRIPTIONS__CHANNEL_CONNECTION_CLOSED
    )
  ) {
    logger.warn("🔄 Helius WSS closed. Reconnecting in 2s...");
  } else {
    logger.error("❌ Unexpected WSS Error:", err);
  }
  setTimeout(() => startMonitoring(), 2000);
}
