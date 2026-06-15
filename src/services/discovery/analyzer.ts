import { config } from "../../../config/config.ts";

export function tokenScore(t) {
  const liquidity = Number(t.tvl || 0);
  const mcap = Number(t.market_cap || 0);
  const vol5m = Number(t.token_tx_volume_usd_5m || 0);
  const buyVol = Number(t.token_buy_tx_volume_usd_5m || 0);
  const sellVol = Number(t.token_sell_tx_volume_usd_5m || 0);
  const buyers = Number(t.token_buyers_5m || 0);
  const sellers = Number(t.token_sellers_5m || 0);
  const holders = Number(t.holders || 0);
  const p5 = Number(t.token_price_change_5m || 0);
  const p1h = Number(t.token_price_change_1h || 0);
  const p24h = Number(t.token_price_change_24h || 0);
  const risk = Number(t.risk_score || 50);

  let score = 0;
  const notes = [];

  // ==================================================
  // BUYER ACTIVITY
  // ==================================================

  const buyerScore = Math.min(25, buyers * 0.5);

  score += buyerScore;

  if (buyers > 30) notes.push("Buyer surge");
  if (buyers > 80) notes.push("Heavy buyer activity");

  // ==================================================
  // BUY PRESSURE
  // ==================================================

  const flow =
    (buyVol - sellVol) /
    Math.max(
      1,
      buyVol + sellVol
    );

  const flowScore = Math.max(0, flow * 20);

  score += flowScore;

  if (flow > 0.3) notes.push("Strong buy pressure");
  if (flow > 0.6)notes.push("Aggressive accumulation");

  // ==================================================
  // BUYER / SELLER RATIO
  // ==================================================

  const buyerRatio = buyers / Math.max(1, sellers);

  if (buyerRatio > 1.5) score += 5;
  if (buyerRatio > 2) score += 5;

  if (buyerRatio > 2) notes.push("Buyer dominance");

  // ==================================================
  // LIQUIDITY QUALITY
  // ==================================================

  const liqMc = liquidity / Math.max(1, mcap);

  if (liqMc > 0.5) {
    score += 15;
    notes.push(
      "Strong liquidity backing"
    );
  }
  else if (liqMc > 0.25) {
    score += 10;
  }
  else if (liqMc > 0.1) {
    score += 5;
  }

  // ==================================================
  // ENERGY
  // ==================================================

  const energy =
    liquidity > 0
      ? vol5m / liquidity
      : 0;

  score += Math.min(
    10,
    energy * 3
  );

  if (energy > 1) notes.push("High attention");
  if (energy > 3) notes.push("Volume spike");

  // ==================================================
  // HOLDER STRENGTH
  // ==================================================

  if (holders > 100) score += 2;
  if (holders > 300) score += 3;

  if (holders > 1000) {
    score += 5;
    notes.push("Growing holder base");
  }

  // ==================================================
  // MOMENTUM
  // ==================================================

  if (
    p5 > 5 &&
    p5 < 40
  ) {
    score += 3;
    notes.push("Momentum building");
  }

  if (
    p1h > 10 &&
    p1h < 80
  ) {
    score += 2;
  }

  if (
    p5 > 80 ||
    p1h > 150
  ) {
    score -= 8;
    notes.push("Potentially overextended");
  }

  // ==================================================
  // MARKET CAP SWEET SPOT
  // ==================================================

  if (
    mcap > 20000 &&
    mcap < 200000
  ) {
    score += 5;
    notes.push("Early market cap zone");
  }

  // ==================================================
  // BUYER CONVICTION
  // ==================================================

  const avgBuySize =
    buyVol /
    Math.max(1, buyers);

  if (avgBuySize > 200) score += 3;

  if (avgBuySize > 500) {
    score += 5;
    notes.push("Large buyer conviction");
  }

  // ==================================================
  // WASH TRADING DETECTION
  // ==================================================

  if (
    liquidity > 0 &&
    vol5m > liquidity * 5
  ) {
    score -= 15;
    notes.push("Possible wash trading");
  }

  // ==================================================
  // RISK PENALTY
  // ==================================================

  if (risk > 90) score -= 25;
  else if (risk > 80) score -= 20;
  else if (risk > 70) score -= 15;
  else if (risk > 60) score -= 10;

  if (risk > 70) notes.push("High risk");

  // ==================================================
  // NORMALIZE
  // ==================================================

  score = Math.max(
    0,
    Math.min(100, score)
  );

  let rating;

  if (score >= 85) rating = "🔥 GEM";
  else if (score >= 70) rating = "🚀 BREAKOUT";
  else if (score >= 60) rating = "👀 WATCH";
  else return false;

  return {
    name: t.name,
    symbol: t.symbol,
    mint: t.token,

    score: Number(score.toFixed(2)),
    rating,

    energy: Number(energy.toFixed(2)),
    flow: Number(flow.toFixed(2)),
    buyerRatio: Number(buyerRatio.toFixed(2)),
    avgBuySize: Number(avgBuySize.toFixed(2)),

    liquidity,
    mcap,
    holders,

    p5,
    p1h,
    p24h,

    notes
  };
}
