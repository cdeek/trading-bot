import { momentumStrategy } from "./strategies/momentum.ts";
import { createClient } from "./blockchain/solanaClient.ts";
import { startMonitoring } from "./blockchain/eventListener.ts";
import {initConfig} from "../config/config.ts"
import logger from "./utils/logger.ts";
import express from "express";
import { Telegraf } from "telegraf";

const app = express();

const abort = {
  controller: new AbortController()
};

(async () => {
  try {
    await initConfig();
    await startTelegramBot(app, abort);

    await createClient();
    await startMonitoring(abort.controller);

    app.post("/helius", (req, res) => {
      res.status(200);
    });

    app.listen(3000, () => logger.info("Server listening on port 3000"));
  } catch (err) {
    logger.error(err);
  }

  process.on("SIGINT", () => {
    abort.controller.abort();
    process.exit();
  });
})();
