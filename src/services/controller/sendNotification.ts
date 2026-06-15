import { logger } from './utils/logger';
import { bot } from "../../index.ts"; 

export const sendNotification = async (message: string) => {
  try {
    const groupId = process.env.TELEGRAM_GROUP_ID;
    
    if (!groupId) {
      logger.error("Telegram notify failed: TELEGRAM_GROUP_ID is undefined in environment variables.");
      return;
    }

    // 1. Switched to HTML formatting to completely eliminate dynamic string rendering crashes
    const formatted = [
      `🚨 <b>SYSTEM NOTIFICATION</b>`,
      "-----------------------------",
      message
    ].join("\n");

    // 2. Transmit directly to the designated channel/group hook
    await bot.telegram.sendMessage(
      groupId,
      formatted,
      { 
        parse_mode: "HTML",
        // Optional: Disables web page previews for links inside the notification text to save screen space
        link_preview_options: { is_disabled: true } 
      }
    );

  } catch (err: any) {
    // 3. Catch Rate Limits (429) or Network Timeouts without halting your engine's trading pipelines
    if (err.code === 429) {
      logger.error(`Telegram Notification Rate Limited! Must wait ${err.parameters?.retry_after}s`);
      // Optional: Push to a local fallback queue array if message persistence is mission-critical
    } else {
      logger.error({ err }, "Telegram notification network dispatch failure:");
    }
  }
};
