import { hardFilter } from "./filters.ts";
import { tokenScore } from "./analyzer.ts";
import { rankAttentionTokens } from "./attentionTokens.ts";
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
    
    if (passedTokens.length === 0) return;
    // 3. Build a readable message string for Telegram
    let message = `🔔 *TOKEN DISCOVERED* 🔔\n\n `;
    
    passedTokens.forEach(t => { 
      message += `${t.mint}\n\n`;
      message += `🪙 *${t.name}* (Score: ${t.score} | ${t.rating ?? ""})\n`;
      message += `• MCAP: $${t.mcap.toLocaleString()}\n`;
      message += `• Liq: $${t.liquidity.toLocaleString()}\n`;
      message += `• Holders: ${t.holders}\n`;
      message += `• Energy/Flow: ${t.energy} / ${t.flow}\n\n`;
      message += `• Notes: \n${t.notes || 'None'}\n\n`;
      message += `-------------------------------\n\n`;
    });

    // 4. Send the constructed message payload
    await sendNotification(message); 

  } catch (err) {
    logger.error(err, "Error in discoverTokens:");
  }
};
