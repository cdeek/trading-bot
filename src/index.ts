import dotenv from "dotenv";
dotenv.config();

import express from "express";
import { handleMomentum } from "./strategies/momentum.ts";
import { createClient } from "./blockchain/solanaClient.ts";
import { startMonitoring } from "./blockchain/eventListener.ts";
import { startTelegramBot } from "./bots/telegram.ts";
import { initConfig } from "../config/config.ts";
import logger from "./utils/logger.ts";
import { Telegraf } from "telegraf";

const app = express();

const abort = {
  controller: new AbortController()
};

(async () => {
  try {
    await initConfig();
    await createClient();
    await startTelegramBot(app, abort);
    logger.info("Telegram Bot is Active");

    app.use(express.json());
    app.post("/helius", (req, res) => {
      res.sendStatus(200);
      handleMomentum(req.body);
    });

    app.listen(8443, () => logger.info("Server listening on port 3000"));
  } catch (err) {
    logger.error(err);
  }

  process.on("SIGINT", () => {
    abort.controller.abort();
    process.exit();
  });
})();
