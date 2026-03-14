import {
  isSolanaError,
  address,
  SOLANA_ERROR__RPC_SUBSCRIPTIONS__CHANNEL_CONNECTION_CLOSED
} from "@solana/kit";

// import { runSnipingStrategy } from "../strategies/sniping.ts";
import logger from "../utils/logger.ts";
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

      listenSubscription(sub, target);
    }
  } catch (err) {
    handleWssError(err);
  }
}

async function listenSubscription(sub: AsyncIterable<any>, target) {
  try {
    for await (const notification of sub) {
      const { err, signature, logs } = notification.value;

      if (err) continue;

      for (const log of logs) {
        if (target.trigger.test(log)) {
          logger.info(target.name);
          break;
        }
      }
    }
  } catch (err) {
    handleWssError(err);
  }
}

function handleWssError(err: unknown) {
  if (
    isSolanaError(
      err,
      SOLANA_ERROR__RPC_SUBSCRIPTIONS__CHANNEL_CONNECTION_CLOSED
    )
  ) {
    logger.warn("🔄 Helius WSS closed. Reconnecting...");
  } else {
    logger.error(err, "❌ Unexpected WSS error");
  }

  setTimeout(startMonitoring, 2000);
}
