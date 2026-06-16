import { promises as fs } from "fs";
import path from "path";
import logger from "../src/utils/logger.ts";

const CONFIG_PATH = path.resolve("config", "config.json");
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
