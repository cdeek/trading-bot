import { Markup } from 'telegraf';
import { monitorToken } from "../../blockchain/solana/eventListener.ts";

export const buy = async (ctx) => {
  try {
    // 1. FIX: Guard against empty or missing payload string entirely
    const payload = ctx.payload?.trim();
    
    if (!payload) {
      return ctx.reply(
        `${UI.icons.fail} *Usage:* \`/buy <amount> <mint_address>\``,
        { parse_mode: "Markdown" }
      );
    }

    const [amountStr, mint] = payload.split(/\s+/); // Splits cleanly on one or multiple spaces
    const amount = parseFloat(amountStr);

    // Validate parameters accurately
    if (!amount || isNaN(amount) || amount <= 0 || !mint) {
      return ctx.reply(
        `${UI.icons.fail} *Invalid Parameters*\\!\nUsage: \`/buy 0.5 TokenMintAddress\``,
        { parse_mode: "MarkdownV2" }
      );
    }

    // 2. Send loading placeholder message
    const loader = await ctx.reply(
      `${UI.icons.loading} <b>Processing Swap Transaction...</b>\n` +
      `Swapping: <code>${amount} ${"SOL"}</code> ➔ <code>${mint.slice(0, 6)}...${mint.slice(-4)}</code>`,
      { parse_mode: "HTML" }
    );

    // 3. Fire the execution transaction to the Solana swap engine
    // Wrapped in a sub-try/catch block to protect your loading UI from getting stuck forever if the engine throws an error
    let result;
    try {
      result = await swap({ mint, amount });
      monitorToken({pool});
    } catch (tradeError: any) {
      console.error("Trade Engine Exception:", tradeError);
      result = { success: false, error: tradeError.message };
    }

    // 4. Handle failed transactions gracefully
    if (!result?.success) {
      const errorMsg = result?.error ? `\nReason: <i>${result.error}</i>` : '';
      
      return await ctx.telegram.editMessageText(
        ctx.chat.id,
        loader.message_id,
        undefined, // inline_message_id must be undefined
        `${UI.icons.fail} <b>Transaction Failed</b>${errorMsg}`,
        { parse_mode: "HTML" }
      ).catch(err => console.log("Failed to edit loader state:", err.message));
    }

    // 5. Handle successful transaction updates
    // Using HTML removes the possibility of a raw signature string containing characters that break Markdown
    const successText = [
      `${UI.icons.success} <b>Trade Confirmed!</b>`,
      UI.divider,
      `<b>Amount:</b> <code>${amount} SOL</code>`,
      `<b>Asset:</b> <code>${mint}</code>`,
      UI.divider,
      `🔗 <a href="https://solscan.io/tx/${result.signature}">View Transaction on Solscan</a>`
    ].join("\n");

    await ctx.telegram.editMessageText(
      ctx.chat.id,
      loader.message_id,
      undefined,
      successText,
      { 
        parse_mode: "HTML", 
        link_preview_options: { is_disabled: true } // Keeps the chat group clean
      }
    ).catch(err => console.log("Failed to finalize loader state:", err.message));

  } catch (globalError) {
    console.error("Critical error inside buy controller wrapper:", globalError);
    ctx.reply("❌ An unexpected systems error occurred while handling your purchase directive.");
  }
};
