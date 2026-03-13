import {
  isSolanaError,
  address,
  SOLANA_ERROR__RPC_SUBSCRIPTIONS__CHANNEL_CONNECTION_CLOSED
} from "@solana/kit";

import { runSnipingStrategy } from "../strategies/sniping.ts";
import { runWhaleStrategy } from "../strategies/walletTracking.ts";
import logger from "../utils/logger.ts";
import {decodeUnifiedEvent} from "../utils/decoder.ts";
import { TARGETS } from "../../config/config.ts";
import { client } from "./solanaClient.ts";

export async function startMonitoring() {
  const controller = new AbortController();

  try {
    for (const target of TARGETS) {
      const sub = await client.rpcSubscriptions
        .logsNotifications(
          { mentions: [address(target.addr)] },
          { commitment: "processed" }
        )
        .subscribe({ abortSignal: controller.signal });

      logger.info(`📡 Monitoring ${target.name} via Helius WSS`);

      listenSubscription(sub, target.name);
    }
  } catch (err) {
    handleWssError(err);
  }
}

async function listenSubscription(sub: AsyncIterable<any>, target: string) {
  try {
    for await (const notification of sub) {
      const { err, signature, logs } = notification.value;

      if (err) continue;

      processLogs(signature, logs, target);
    }
  } catch (err) {
    handleWssError(err);
  }
}

export async function processLogs(logs, sig, target) {
  let decodedEvent = null;

  let isTargetAction = false;
  let actionLabel = "";

  switch (target) {
    case "PumpFun":
      for (const log of logs) {
        if (
          log.includes("Instruction: Migrate") &&
          !log.includes("Instruction: MigrateB")
        ) {
          actionLabel = "PUMPSWAP_MIGRATION";
          isTargetAction = true;
          break;
        }
      }
      break;

    case "Raydium":
      for (const log of logs) {
        if (
          log.includes("Instruction: CreatePool") ||
          log.includes("Instruction: initialize2") ||
          log.includes("Instruction: initialize")
        ) {
          actionLabel = "RAYDIUM_POOL_CREATED";
          isTargetAction = true;
          break;
        }
      }
      break;

    case "Whale1":
      for (const log of logs) {
        if (
          log.includes("Instruction: Swap") ||
          log.includes("Jupiter") ||
          log.includes("Route") ||
          log.includes("Create")
        ) {
          actionLabel = "WHALE_MOVE";
          isTargetAction = true;
          break;
        }
      }
      break;
  }

  if (isTargetAction) {
    for (const log of logs) {
      if (log.includes("Program data: ") || log.includes("ray_log: ")) {
        decodedEvent = decodeUnifiedEvent(log);

        if (decodedEvent) {
          logger.info(
            `🔥 [${actionLabel}] Detected! | Platform: ${decodedEvent.platform} | Sig: ${sig}`
          );

          // Execute your specific strategy based on target
          if (target === "Whale") {
            runWhaleStrategy(sig, "WHALE", decodedEvent);
          } else {
            runSnipingStrategy(sig, target, decodedEvent);
          }
          return; // Exit after first successful decode for this signature
        }
      }
    }
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
    logger.error(err, "❌ Unexpected WSS Error:");
  }

  setTimeout(() => startMonitoring(), 2000);
}
