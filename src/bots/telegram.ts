import { Telegraf, Markup, session } from "telegraf";
import { saveConfig, config } from "../../config/config.ts";
import { createClient } from "../blockchain/solanaClient.ts";
import { startMonitoring } from "../blockchain/eventListener.ts";
import { sellAllHoldings } from "../blockchain/jupiterUltra.ts";
import { executeTrade } from "./executor.ts";
import logger from "../utils/logger.ts";

/**
 * Modern Terminal Interface for Solana Trading Bot
 * Features: Visual Status Indicators, Grid Menus, and Session Management
 */

export let telBot: any | undefined;
let isPaused = true;

// --- UI Branding & Assets ---
const UI = {
  divider: "───────────────────",
  icons: {
    terminal: "🖥",
    active: "🟢",
    paused: "🟡",
    alert: "🚨",
    settings: "⚙️",
    back: "⬅️",
    success: "✅",
    fail: "❌",
    loading: "⏳",
    cancel: "✖️",
    wallet: "💳",
    chart: "📈",
    target: "🎯"
  }
};

// --- Notification System ---
export const sendNotification = async (message: string) => {
  try {
    const formatted = `${UI.icons.alert} *SYSTEM NOTIFICATION*\n${UI.divider}\n${message}`;
    await telBot.telegram.sendMessage(
      process.env.TELEGRAM_GROUP_ID,
      formatted,
      { parse_mode: "Markdown" }
    );
  } catch (err) {
    logger.error(err, "Telegram notify failed:");
  }
};

export async function startTelegramBot(app, abort): Promise<void> {
  const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

  // Setup Webhook
  app.use(await bot.createWebhook({ domain: process.env.BOT_URL }));

  // Middleware: Security & Session
  bot.use((ctx, next) => {
    if (ctx.from?.id.toString() === process.env.TELEGRAM_CHAT_ID) return next();
    return; // Ignore unauthorized users
  });
  bot.use(session());

  // --- UI Generator: Main Menu ---
  const getMainMenu = () => {
    const statusLabel = isPaused
      ? `${UI.icons.paused} PAUSED`
      : `${UI.icons.active} ACTIVE`;

    const text = [
      `${UI.icons.terminal} *TERMINAL DASHBOARD v2.0*`,
      UI.divider,
      `*Status:* ${statusLabel}`,
      `*Network:* \`Solana Mainnet\``,
      UI.divider,
      `_Select a module to configure:_`
    ].join("\n");

    return {
      text,
      extra: Markup.inlineKeyboard([
        [
          Markup.button.callback(
            isPaused ? "▶️ Resume Operations" : "⏸ Pause Operations",
            isPaused ? "start" : "stop"
          )
        ],
        [
          Markup.button.callback(`${UI.icons.target} Sniper`, "strat_SNIPER"),
          Markup.button.callback(
            `${UI.icons.chart} Momentum`,
            "strat_MOMENTUM_SELL"
          )
        ],
        [Markup.button.callback("🐋 Whale Tracker", "strat_WHALE_TRACKER")],
        [
          Markup.button.callback(
            `${UI.icons.alert} PANIC SELL ALL`,
            "panic_confirm"
          )
        ]
      ])
    };
  };

  // --- Commands ---
  bot.command("config", ctx => {
    const menu = getMainMenu();
    return ctx.replyWithMarkdown(menu.text, menu.extra);
  });

  bot.command("buy", async ctx => {
    const [amount, mint] = ctx.payload.split(" ");
    if (!amount || !mint) {
      return ctx.reply(
        `${UI.icons.fail} *Usage:* \`/buy <amount> <mint_address>\``,
        { parse_mode: "Markdown" }
      );
    }

    const loader = await ctx.reply(
      `${
        UI.icons.loading
      } *Processing Transaction...*\nSending \`${amount} SOL\` to mint \`${mint.slice(
        0,
        6
      )}...\``,
      { parse_mode: "Markdown" }
    );

    const result = await executeTrade({ mint, amount: parseFloat(amount) });

    if (!result?.success) {
      return ctx.telegram.editMessageText(
        ctx.chat.id,
        loader.message_id,
        undefined,
        `${UI.icons.fail} *Transaction Failed*`
      );
    }

    const successText = [
      `${UI.icons.success} *Trade Confirmed*`,
      UI.divider,
      `Signature: [Solscan](https://solscan.io/tx/${result.signature})`
    ].join("\n");

    ctx.telegram.editMessageText(
      ctx.chat.id,
      loader.message_id,
      undefined,
      successText,
      { parse_mode: "Markdown", disable_web_page_preview: true }
    );
  });

  // --- Strategy Actions ---
  bot.action(/^strat_(.+)$/, async ctx => {
    const key = ctx.match[1];
    const strat = config.strategies[key];

    const buttons = Object.entries(strat)
      .filter(([k, v]) => typeof v !== "object" && k !== "label")
      .map(([k, v]) => [
        Markup.button.callback(`${k.toUpperCase()}: ${v}`, `edit_${key}_${k}`)
      ]);

    buttons.push([
      Markup.button.callback(`${UI.icons.back} Main Menu`, "back_to_main")
    ]);

    await ctx.editMessageText(
      `${UI.icons.settings} *${strat.label} SETTINGS*\n${UI.divider}\nSelect a value to modify:`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard(buttons)
      }
    );
  });

  // --- Edit Logic ---
  bot.action(/^edit_(.+)_(.+)$/, async ctx => {
    const [_, strategy, field] = ctx.match;
    ctx.session = { editing: { strategy, field } };

    const prompt = [
      `${UI.icons.settings} *CONFIGURATION*`,
      UI.divider,
      `Field: \`${field}\``,
      `Current: \`${config.strategies[strategy][field]}\``,
      UI.divider,
      `_Type the new value in the chat..._`
    ].join("\n");

    await ctx.reply(prompt, {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback(
            `${UI.icons.cancel} Cancel Edit`,
            "cancel_edit"
          )
        ]
      ])
    });
    await ctx.answerCbQuery();
  });

  bot.action("cancel_edit", async ctx => {
    ctx.session = { editing: null };
    await ctx.answerCbQuery("Edit cancelled");
    await ctx.reply(`${UI.icons.cancel} *Modification Aborted.*`);
    const menu = getMainMenu();
    return ctx.replyWithMarkdown(menu.text, menu.extra);
  });

  bot.on("text", async ctx => {
    if (ctx.session?.editing) {
      const { strategy, field } = ctx.session.editing;
      let input: any = ctx.message.text;

      if (input.toLowerCase() === "cancel") {
        ctx.session.editing = null;
        return ctx.reply("❌ Cancelled.");
      }

      // Simple Type Casting (Number, Bool, String)
      if (!isNaN(input) && input.trim() !== "") {
        input = parseFloat(input);
      } else if (input.toLowerCase() === "true") input = true;
      else if (input.toLowerCase() === "false") input = false;

      config.strategies[strategy][field] = input;
      await saveConfig();

      ctx.session.editing = null;
      await ctx.reply(`${UI.icons.success} *Updated ${field}!*`);

      const menu = getMainMenu();
      ctx.replyWithMarkdown(menu.text, menu.extra);
    }
  });

  // --- Bot Lifecycle Actions ---
  bot.action("back_to_main", async ctx => {
    const menu = getMainMenu();
    await ctx.editMessageText(menu.text, {
      parse_mode: "Markdown",
      ...menu.extra
    });
    await ctx.answerCbQuery();
  });

  bot.action("panic_confirm", async ctx => {
    await ctx.answerCbQuery("Initiating Emergency Liquidation...");
    const { success, detailedResults } = await sellAllHoldings();

    const report = detailedResults
      .map(r => `${r.success ? "✅" : "❌"} \`${r.mint.slice(0, 8)}...\``)
      .join("\n");

    await ctx.reply(
      `🚨 *PANIC SELL REPORT*\n${UI.divider}\n${report}\n${
        UI.divider
      }\nOverall Status: ${success ? "CLEARED" : "ISSUES DETECTED"}`,
      { parse_mode: "Markdown" }
    );
  });

  bot.action("stop", async ctx => {
    isPaused = true;
    await saveConfig();
    abort.controller.abort();
    logger.warn("Monitoring Stop")
    const menu = getMainMenu();
    await ctx.editMessageText(menu.text, {
      parse_mode: "Markdown",
      ...menu.extra
    });
    await ctx.answerCbQuery("Monitoring Paused");
  });

  bot.action("start", async ctx => {
    isPaused = false;
    await saveConfig();
    abort.controller = new AbortController();

    await createClient();
    await startMonitoring(abort.controller);

    const menu = getMainMenu();
    await ctx.editMessageText(menu.text, {
      parse_mode: "Markdown",
      ...menu.extra
    });
    await ctx.answerCbQuery("Bot Resumed");
  });

  telBot = bot;
}
