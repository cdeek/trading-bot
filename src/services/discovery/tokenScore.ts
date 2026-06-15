export function analyzeToken(t) {
  const result = {
    pass: false,
    reason: [],
    score: 0
  };

  // ---------- PARSE NUMBERS ----------
  const liquidity = Number(t.tvl || 0);
  const mcap = Number(t.market_cap || 0);
  const risk = Number(t.risk_score || 100);
  const locked = Number(t.locked_percent || 0);

  const vol5m = Number(t.token_tx_volume_usd_5m || 0);
  const vol1h = Number(t.token_tx_volume_usd_1h || 0);
  const buyVol5m = Number(t.token_buy_tx_volume_usd_5m || 0);
  const sellVol5m = Number(t.token_sell_tx_volume_usd_5m || 0);

  const buyers = Number(t.token_buyers_5m || 0);
  const sellers = Number(t.token_sellers_5m || 0);

  const priceChange5m = Number(t.token_price_change_5m || 0);
  const priceChange1h = Number(t.token_price_change_1h || 0);
  const priceChange24h = Number(t.token_price_change_24h || 0);

  const holders = Number(t.holders || 0);

  // ---------- BASIC SAFETY FILTERS ----------

  if (t.is_mintable === "1") result.reason.push("Mintable token");
  if (t.is_in_blacklist === "1") result.reason.push("Blacklisted token");
  if (t.is_honeypot === "1") result.reason.push("Honeypot detected");

  if (t.has_black_method === "1") result.reason.push("Suspicious contract method");
  if (t.has_not_renounced === "1") result.reason.push("Ownership not renounced");
  if (t.has_not_audited === "1") result.reason.push("No audit signal");

  // ---------- LIQUIDITY CHECK ----------

  if (liquidity < 50000) result.reason.push("Very low liquidity");
  else if (liquidity < 100000) result.score += 5;
  else result.score += 15;

  // ---------- MARKET CAP HEALTH ----------

  const liqMcRatio = liquidity / (mcap || 1);

  if (liqMcRatio < 0.02) result.reason.push("Weak liquidity backing");
  else if (liqMcRatio > 0.5) result.score += 10;
  else result.score += 5;

  // ---------- VOLUME MANIPULATION CHECK ----------

  const buySellRatio = buyVol5m / (sellVol5m || 1);

  if (buySellRatio < 0.8) result.reason.push("Selling pressure dominant");
  if (buySellRatio > 1.2) result.score += 10;

  // fake activity detection
  if (vol5m > liquidity * 2) {
    result.reason.push("Possible wash trading (volume > 2x liquidity)");
  }

  // ---------- MOMENTUM CHECK ----------

  if (priceChange5m > 10) result.score += 10;
  if (priceChange1h > 30) result.score += 10;
  if (priceChange24h > 100) result.score += 10;

  // overheated pump detection
  if (priceChange5m > 80) result.reason.push("Parabolic short-term pump");

  // ---------- BUYER QUALITY ----------

  const buyerRatio = buyers / (sellers || 1);

  if (buyers < 10) result.reason.push("Very low buyer diversity");
  if (buyerRatio < 1) result.reason.push("More sellers than buyers");
  if (buyerRatio > 1.2) result.score += 10;

  // ---------- HOLDER QUALITY ----------

  if (holders < 100) result.reason.push("Very early / unstable holder base");
  else if (holders > 1000) result.score += 10;

  // ---------- RISK SCORE (external API) ----------

  if (risk > 70) result.reason.push("High external risk score");
  else if (risk < 40) result.score += 10;

  // ---------- FINAL DECISION ----------

  if (result.reason.length === 0 && result.score >= 40) {
    result.pass = true;
  }

  if (result.score >= 60 && result.reason.length <= 2) {
    result.pass = true;
  }

  return result;
}