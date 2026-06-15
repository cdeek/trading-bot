import { hardFilter } from "./filters.ts";
import { tokenScore } from "./analyzer.ts";
import { rankAttentionTokens } from "./attentionTokens.ts";
import { addToWatchlist } from "./watchlist.ts"; // Note: Imported but not used yet in this snippet
import { sendNotification } from "../controller/sendNotification.ts";
import logger from "../../utils/logger.ts";

// 1. Added 'async' keyword here so 'await' works inside
export const discoverTokens = async () => {
  try {
    const result = await fetch(`${process.env.AVE_BASE_URL}/ranks?topic=${'solana'}`, {
      headers: {
        "X-API-KEY": process.env.AVE_API_KEY || ""
      }
    });
    
    const responseData = await result.json();
    const tokens = responseData.data || [];
    const tokenArr = [];

    for (const token of tokens) {
      if (!hardFilter(token)) continue;
      const analysis = tokenScore(token);
      if (!analysis) continue;
      tokenArr.push(analysis);
    }

    const passedTokens = rankAttentionTokens(tokenArr);

    // 2. Assigned the mapped array to a variable (formattedTokens)
    const formattedTokens = passedTokens.map(t => ({
      Symbol: t.symbol,
      Score: t.score,
      Rating: t.rating,
      Energy: t.energy,
      Flow: t.flow,
      BuyerRatio: t.buyerRatio,
      AvgBuy: Math.round(t.avgBuySize),
      Holders: t.holders,
      MCAP: Math.round(t.mcap),
      Liquidity: Math.round(t.liquidity),
      Notes: t.notes.join("\n")
    }));
    
    if (formattedTokens.length === 0) return;
    // 3. Build a readable message string for Telegram
    let message = `🔔 *TOKEN DISCOVERED* 🔔\n\n`;
    
    formattedTokens.forEach(t => {
      message += `🪙 *${t.Symbol}* (Score: ${t.Score} | ${t.Rating})\n`;
      message += `• MCAP: $${t.MCAP.toLocaleString()}\n`;
      message += `• Liq: $${t.Liquidity.toLocaleString()}\n`;
      message += `• Holders: ${t.Holders}\n`;
      message += `• Energy/Flow: ${t.Energy} / ${t.Flow}\n`;
      message += `• Notes: \n${t.Notes || 'None'}\n\n`;
    });

    // 4. Send the constructed message payload
    await sendNotification(message); 

  } catch (err) {
    logger.error("Error in discoverTokens:", err);
  }
};
