import { config } from "../../../config/config.ts";

export function hardFilter(t, age) { 
  if (
    +((age / 3600).toFixed(1)) > config.maxAgeHr ||
    +((age / 60).toFixed(1)) <  config.minAgeMn
  ) 
    return false;

  // Guaranteed scam indicators
  if (t.is_honeypot === "1") return false;
  if (t.is_in_blacklist === "1") return false;
  if (t.has_black_method === "1") return false;

  // // External risk score
  if (Number(t.risk_score || 0) >= 80) return false;

  // // Mintable
  if (t.is_mintable === "1") return false;

  // // Liquidity
  if (Number(t.tvl || 0) < config.minLiquidity) return false;
  
  if (Number(t.holders || 0) < config.minHolders) return false;
  
  return true;
}
