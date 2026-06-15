import { Markup } from 'telegraf';
import { getMainMenu } from "./getMenu.ts";
import { config, saveConfig } from "../../config/config.ts"; // Ensure these are imported
import { analyzeToken } from "../discovery/tokenScore.ts"; 
import logger from "../../utils/logger.ts"; 

const UI = {
  icons: { settings: "⚙️", back: "↩️", divider: "-------------------" }
};

export const edit = async (ctx) => {
  const [_, field] = ctx.match;

  ctx.session ??= {};
  ctx.session.editing = { field };
  ctx.session.lastMenuMessageId = ctx.callbackQuery.message.message_id;
 
  const currentValue = config?.[field] ?? "Not Set";

  const prompt = [
    `⚙️ *CONFIGURATION*`,
    "-------------------",
    `Field: \`${field}\``,
    `Current: \`${currentValue}\``,
    "-------------------",
    `_Type the new value in the chat..._`
  ].join("\n");

  await ctx.editMessageText(prompt, {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard([
      [Markup.button.callback(`❌ Cancel Edit`, "cancel_edit")]
    ])
  }).catch((err) => logger.error(err.message, "UI rewrite warning in edit:"));

  await ctx.answerCbQuery();
};

export const onText = async (ctx) => {
  const textInput = ctx.message?.text?.trim();

  // 1. Regex definitions for both EVM and Solana
  const isEVM = /^0x[a-fA-F0-9]{40}$/.test(textInput || "");
  const isSolana = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(textInput || "");

  // Intercept if it matches either standard blockchain address format
  if (isEVM || isSolana) {
    try {
      // Pass the address to your analyze function and exit early
      const result = await fetch(`${process.env.AVE_BASE_URL}/ranks?topic=${'solana'}`, {
        headers: {
          "X-API-KEY": process.env.AVE_API_KEY || ""
        }
      });
      
      const responseData = await result.json();
      const token = analyzeToken(responseData) 
      return ctx.reply(`Token Pass: ${token.pass}\n\n${token.reason.join("\n")}`);
    } catch (error) {
      logger.error(error, "Error analyzing token:");
      return ctx.reply("❌ An error occurred while analyzing the token.");
    }
  }

  // 2. Fallback to normal configuration editing mode
  if (ctx.session?.editing) {
    const { field } = ctx.session.editing;
    let input: any = ctx.message.text;
  
    // Handle manual text cancel overrides
    if (input.toLowerCase() === "cancel") {
      ctx.session.editing = null;
      await ctx.reply("❌ Input configuration cancelled.");
      const menu = getMainMenu();
      return ctx.reply(menu.text, menu.extra);
    }
  
    // Stricter primitive parsing logic
    const trimmedInput = input.trim();
    if (trimmedInput.toLowerCase() === "true") {
      input = true;
    } else if (trimmedInput.toLowerCase() === "false") {
      input = false;
    } else if (!isNaN(Number(trimmedInput)) && trimmedInput !== "") {
      input = parseFloat(trimmedInput); 
    }
    
    // Assign the parsed parameter value safely
    config[field] = input;
    await saveConfig();
    
    if (ctx.session.lastMenuMessageId) {
      await ctx.telegram.editMessageReplyMarkup(
        ctx.chat.id, 
        ctx.session.lastMenuMessageId, 
        undefined, 
        { inline_keyboard: [] } 
      ).catch(() => {});
    }
  
    // Clear editing tracking flag safely
    ctx.session.editing = null;
  
    // Escaped punctuation values to avoid Markdown execution errors
    await ctx.reply(`✔️ *Updated ${field} to \`${input}\`\\!*`, { 
      parse_mode: "Markdown" 
    });
  
    // Pull fresh dashboard layout mirroring the new configuration settings
    const menu = getMainMenu();
    await ctx.reply(menu.text, menu.extra);
  }
};

