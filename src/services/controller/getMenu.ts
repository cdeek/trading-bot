import { Markup } from 'telegraf';
import { isPause } from "../../index.ts";

// Mock UI configuration for demonstration
const UI = {
  icons: { terminal: '💻', paused: '🔴', active: '🟢', target: '🎯', chart: '📈', alert: '🚨' },
  divider: '───────────────────'
};

export const getMainMenu = () => {
  const statusLabel = isPaused
    ? `${UI.icons.paused} PAUSED`
    : `${UI.icons.active} ACTIVE`;

  // FIX: Escaped the dot in v2\.0 for MarkdownV2 compliance
  const text = [
    `${UI.icons.terminal} *TERMINAL DASHBOARD v2\\.0*`,
    UI.divider,
    `*Status:* ${statusLabel}`,
    UI.divider,
    `_Select a module to configure:_`
  ].join("\n");

  return {
    text,
    // Add extra parsing metadata right inside the object
    extra: {
      parse_mode: 'MarkdownV2',
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback(
            isPaused ? "▶️ Start discovery Engine" : "⏸ PStop dDiscovery Engine",            
            isPaused ? "start_discovery" : "stop_discovery" // Clarified callback names
          )
        ],
        Object.entries(config).map(([k, v])=> Markup.button.callback(`${k.toUpperCase()}: ${v}`, `edit_${k}`))
      ])
    }
  };
};
