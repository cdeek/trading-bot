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
    name: "PumpSwap",
    addr: "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA",
    trigger: /instruction: (create_pool|swap)/i
  },
  {
    name: "Raydium CPM",
    addr: "CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C",
    trigger: /instruction: (create_pool|initialize|swap)/i
  },
  {
    name: "Meteora",
    addr: "dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN",
    trigger: /instruction: (migrate_meteora_damm|swap)/i
  },
  // {
  //   name: "SmartMoney",
  //   addr: "dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN",
  //   trigger: /instruction: (whirlpoolswap|swap)/i
  // },
  // {
  //   name: "SmartMoney",
  //   addr: "dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN",
  //   trigger: /instruction: (whirlpoolswap|swap)/i
  // }
];
