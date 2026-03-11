import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();

const CONFIG_PATH = path.resolve("config", "strategies.json");
export let config = {};

export async function initConfig() {
  try {
    const data = await fs.readFile(CONFIG_PATH, "utf8");
    config = JSON.parse(data);
    logger.info("✅ Config loaded into memory (Async)");
  } catch (err) {
    logger.error(err, "❌ Critical: Could not read config.json");
    process.exit(1);
  }
}

export async function saveConfig() {
  try {
    const data = JSON.stringify(config, null, 2);
    await fs.writeFile(CONFIG_PATH, data, "utf8");
    logger.info("💾 Config persisted to disk.");
  } catch (err) {
    logger.error(err, "⚠️ Failed to save config");
  }
}

export const BOT_URL = process.env.BOT_URL;
export const COLD_WALLET = process.env.COLD_WALLET;

export const RPC_URL = process.env.RPC_URL;
export const PRIVATE_KEY = process.env.PRIVATE_KEY;

export const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
export const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
export const TELEGRAM_GROUP_ID = process.env.TELEGRAM_GROUP_ID;

export const TARGETS = [
  {
    name: "PumpFun",
    addr: address("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P")
  },
  {
    name: "Raydium",
    addr: address("675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8")
  },
  { name: "Whale1", addr: address("7815q...p9W") } // Add your whale here
];
