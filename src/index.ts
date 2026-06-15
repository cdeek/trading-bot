import dotenv from "dotenv";
dotenv.config();
import crypto from "crypto"; 

import { Telegraf, Markup, session } from "telegraf";
import { message } from "telegraf/filters";
import { saveConfig, config, initConfig } from "../../config/config.ts";
import logger from "../utils/logger.ts";
import { getMainMenu } from "./services/controller/getMenu.ts";
import { buy } from "./services/controller/buy.ts";
import { edit, onText, type } from "./services/controller/edit.ts";
import { discoverTokens } from "./services/discovery/index.ts";

// Fix 1: Uniform, clear state configuration naming
export let isPaused = true;
let discoveryInterval: NodeJS.Timeout | null = null;

export const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN!);
await initConfig();

// --- Middleware: Security & Session ---
bot.use((ctx, next) => {
  if (ctx.from?.id.toString() === process.env.TELEGRAM_CHAT_ID) {
    return next();
  }
  logger.warn(`Unauthorized access attempt from user ID: ${ctx.from?.id}`);
  return; // Silent ignore unauthorized entry
});

bot.use(session()); 

// --- Core Routes & Commands ---
bot.start((ctx) => ctx.reply('Welcome to the Terminal! Good luck 🚀'));

bot.command('dashboard', (ctx) => {
  const menu = getMainMenu();
  return ctx.reply(menu.text, menu.extra);
});

// --- Button Callback Actions ---
bot.action('back_to_main', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const menu = getMainMenu();
  await ctx.editMessageText(menu.text, menu.extra).catch(() => {});
});

bot.action("cancel_edit", async (ctx) => {
  if (ctx.session) ctx.session.editing = null;
  await ctx.answerCbQuery("Edit cancelled.").catch(() => {});
  const menu = getMainMenu();
  await ctx.editMessageText(menu.text, menu.extra).catch(() => {});
});

// Fix 2: Added 'ctx' explicitly to the parameters so methods function properly
bot.action("start_discovery", async (ctx) => { 
  await ctx.answerCbQuery("⚡ Discovery Engine Operational").catch(() => {});
  // Fix 3: Standardized variable name and un-inverted state logic
  isPaused = false; 
  startDiscoveryLoop(); // Safely spin up background process thread
  const menu = getMainMenu();
  await ctx.editMessageText(menu.text, menu.extra).catch(() => {});
}); 

bot.action("stop_discovery", async (ctx) => {
  await ctx.answerCbQuery("🛑 Discovery Engine Offline").catch(() => {});
  isPaused = true; 
  stopDiscoveryLoop(); // Cease background system tasks
  const menu = getMainMenu();
  await ctx.editMessageText(menu.text, menu.extra).catch(() => {});
}); 

bot.action(/^edit_(.+)$/, edit);

bot.on(message("text"), onText);

function startDiscoveryLoop() {
  if (discoveryInterval) return; // Prevent duplicate concurrent loops
  
  logger.info("Initializing background Token Discovery Pipeline...");
  
  discoverTokens()

  // Schedule trailing operations every 10 seconds
  discoveryInterval = setInterval(async () => {
    if (isPaused) {
      stopDiscoveryLoop();
      return;
    }
    await discoverTokens();
  }, 10000);
}

function stopDiscoveryLoop() {
  if (discoveryInterval) {
    clearInterval(discoveryInterval);
    discoveryInterval = null;
    logger.info("Token Discovery Pipeline suspended successfully.");
  }
}

// --- Bot Launch Strategy ---
bot.launch({
  webhook: {
    domain: process.env.BOT_URL!, // e.g. https://my-trading-bot.loca.lt
    port: Number(process.env.PORT) || 3000,
    secretToken: crypto.randomBytes(64).toString("hex")
  }
}).then(() => {
  logger.info("Telegraf Webhook connection fully mounted.");
}).catch(err => {
  logger.fatal(err, "Critical bot launch failure:");
});

// Graceful application shutdown protocols
process.once('SIGINT', () => {
  stopDiscoveryLoop();
  bot.stop('SIGINT');
});
process.once('SIGTERM', () => {
  stopDiscoveryLoop();
  bot.stop('SIGTERM');
});