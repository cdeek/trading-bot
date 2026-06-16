import { Markup } from 'telegraf';
import { isPaused } from "../../../index.ts";
import { config } from "../../../config/config.ts"; // Ensure these are imported

const UI = {
  icons: { terminal: '💻', paused: '🔴', active: '🟢', target: '🎯', chart: '📈', alert: '🚨' },
  divider: '───────────────────'
};

// Helper function to split an array into chunks of a specific size
const chunkArray = <T>(array: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
};

export const getMainMenu = () => {
  const statusLabel = isPaused
    ? `${UI.icons.paused} PAUSED`
    : `${UI.icons.active} ACTIVE`;

  const text = [
    `${UI.icons.terminal} *TERMINAL DASHBOARD v2\\.0*`,
    UI.divider,
    `*Status:* ${statusLabel}`,
    UI.divider,
    `_Select a module to configure:_`
  ].join("\n");

  // 1. Single full-width button for the Engine control
  const primaryRow = [
    Markup.button.callback(
      isPaused ? "▶️ Start Discovery Engine" : "⏸ Stop Discovery Engine",            
      isPaused ? "start_discovery" : "stop_discovery" 
    )
  ];

  // 2. Map config object to a flat list of buttons
  const flatConfigButtons = Object.entries(config).map(([k, v]) => 
    Markup.button.callback(`${k.toUpperCase()}: ${v}`, `edit_${k}`)
  );

  // 3. Chunk the config buttons into rows of 2 columns
  const configRows = chunkArray(flatConfigButtons, 2);

  return {
    text,
    extra: {
      parse_mode: 'MarkdownV2',
      // Combine the primary full-width row with the 2-column config rows
      reply_markup: Markup.inlineKeyboard([
        primaryRow, 
        ...configRows
      ]).reply_markup
    }
  };
};
