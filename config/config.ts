import { promises as fs } from "fs";
import path from "path";
import logger from "../src/utils/logger.ts";

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

export const BASE_MINT = "So11111111111111111111111111111111111111112";
export const TARGETS = [
  {
    name: "PumpFun",
    addr: "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"
  },
  {
    name: "Raydium",
    addr: "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8"
  },
  {
    name: "Raydium",
    addr: "CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C"
  }
];
