import { Telegraf, Markup, session } from "telegraf";

import {
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID,
  TELEGRAM_GROUP_ID,
  BOT_URL,
  saveConfig
} from "../../config/config.ts";
import { createClient } from "../blockchain/solanaClient.ts";
import { startMonitoring } from "../blockchain/eventListener.ts";
import logger from "../utils/logger.ts";

export let telBot: any | undefined;

// Function to send a notification to YOU
export const sendNotification = async message => {
  try {
    await telBot.telegram.sendMessage(TELEGRAM_GROUP_ID, message);
  } catch (err) {
    logger.error("Telegram notify failed:", err);
  }
};

export async function startTelegramBot(app, abort): Promise<void> {
  const bot = new Telegraf(TELEGRAM_BOT_TOKEN);

  app.use(await bot.createWebhook({ domain: BOT_URL }));

  bot.use((ctx, next) => {
    if (ctx.from.id !== TELEGRAM_CHAT_ID) return;
    return next();
  });

  bot.use(session());

  // --- Main Menu Interface ---
  const getMainMenu = () => {
    const status = config.global.isPaused ? "⏸️ PAUSED" : "▶️ ACTIVE";
    return {
      text: `*Terminal Dashboard*\nStatus: ${status}\n`,
      extra: Markup.inlineKeyboard([
        [
          Markup.button.callback(
            config.global.isPaused ? "▶️ Resume" : "⏸️ Pause",
            config.global.isPaused ? "start" : "stop"
          )
        ],
        [
          Markup.button.callback("🎯 Sniper", "strat_SNIPER"),
          Markup.button.callback("📈 Momentum", "strat_MOMENTUM_SELL")
        ],
        [Markup.button.callback("🐋 Whale Tracker", "strat_WHALE_TRACKER")]
      ]).resize()
    };
  };

  bot.command("configure", ctx => {
    const menu = getMainMenu();
    ctx.replyWithMarkdown(menu.text, menu.extra);
  });

  const togglePause = async ctx => {
    config.global.isPaused = !config.global.isPaused;

    await saveConfig();

    const menu = getMainMenu();
    await ctx.editMessageText(menu.text, {
      parse_mode: "Markdown",
      ...menu.extra
    });
    await ctx.answerCbQuery(
      `Bot ${config.global.isPaused ? "Paused" : "Resumed"}`
    );
  };

  // Dynamic Strategy Menu
  bot.action(/^strat_(.+)$/, async ctx => {
    const key = ctx.match[1];
    const strat = config.strategies[key];

    const buttons = Object.entries(strat)
      .filter(([k, v]) => typeof v !== "object" && k !== "label")
      .map(([k, v]) => [
        Markup.button.callback(`${k}: ${v}`, `edit_${key}_${k}`)
      ]);

    buttons.push([Markup.button.callback("⬅️ Back", "back_to_main")]);

    await ctx.editMessageText(`*${strat.label} Settings*`, {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard(buttons)
    });
  });

  bot.action("back_to_main", async ctx => {
    const menu = getMainMenu();
    await ctx.editMessageText(menu.text, {
      parse_mode: "Markdown",
      ...menu.extra
    });
  });

  bot.action(/^edit_(.+)_(.+)$/, ctx => {
    const [_, strategy, field] = ctx.match;
    ctx.session = { editing: { strategy, field } };
    ctx.reply(
      `✏️ Send new value for \`${field}\` (Currently: \`${config.strategies[strategy][field]}\`):`,
      { parse_mode: "Markdown" }
    );
  });

  bot.on("text", async ctx => {
    if (ctx.session?.editing) {
      const { strategy, field } = ctx.session.editing;
      let input = ctx.message.text;

      // Simple Type Casting
      if (!isNaN(input) && input.trim() !== "") {
        input = parseFloat(input);
      } else if (input.toLowerCase() === "true") input = true;
      else if (input.toLowerCase() === "false") input = false;

      config.strategies[strategy][field] = input;

      await saveConfig(); // Non-blocking write

      ctx.session.editing = null;
      ctx.reply(`✅ Updated ${field}. Returning to main menu...`);

      const menu = getMainMenu();
      ctx.replyWithMarkdown(menu.text, menu.extra);
    }
  });

  bot.action("stop", async ctx => {
    await togglePause(ctx);
    abort.controller.abort();
  });

  bot.action("start", async ctx => {
    await togglePause(ctx);
    abort.controller = new AbortController();

    const client = await createClient();
    await startMonitoring(abort.controller);
  });

  telBot = bot;
}
