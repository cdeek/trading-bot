
import logger from "../utils/logger.ts";
import {
  getParsedAccountInfo,
  getTokenLargestAccounts,
  getAccountInfo
} from "@solana/kit";

const LAMPORTS_PER_SOL = 1_000_000_000n;
const WRAPPED_SOL = "So11111111111111111111111111111111111111112";

/**
 * Entry point for your sniper strategy
 */
export async function runSnipingStrategy(event) {
  const { mint, pool, platform } = event;

  // 1) Authority safety gate
  const safe = await checkAuthoritySafety(mint);
  if (!safe) {
    logger.warn(`🚫 Authority risk — skipping ${mint}`);
    return;
  }

  // 2) Fetch liquidity in SOL
  const liquiditySOL = await getPoolLiquiditySOL(pool, mint);

  // 3) Score token
  const score = await computeTokenScore(mint, liquiditySOL);

  logger.info(
    `🔍 Score for ${mint} => Total: ${score.total}, Liquidity: ${score.liquidity}, Holders: ${score.holders}, Activity: ${score.activity}, Risk: ${score.risk}`
  );

  // 4) Decide what to do
  if (score.total >= 80) {
    logger.info(`📈 High confidence buy detected for ${mint}`);
    await executeBuy({ mint, pool, platform });
  } else if (score.total >= 60) {
    logger.info(`🤝 Moderate confidence — small buy for ${mint}`);
    await executeBuy({ mint, pool, platform, amount: 0.05 });
  } else {
    logger.info(`⛔ Low confidence — skipping buy for ${mint}`);
  }
}

/**
 * Hard gate for authority risk
 * — Must have BOTH mintAuthority and freezeAuthority revoked
 */
async function checkAuthoritySafety(mint) {
  try {
    const info = await connection.getParsedAccountInfo(mint);
    if (!info?.value?.data?.parsed?.info) return false;
    const { mintAuthority, freezeAuthority } = info.value.data.parsed.info;

    // If either authority is still set → reject
    if (mintAuthority) return false;
    if (freezeAuthority) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Normalize liquidity fetch for any pool type
 */
async function getPoolLiquiditySOL(pool, mint) {
  try {
    const info = await connection.getAccountInfo(pool);
    if (!info || !info.data) return 0n;

    const raw = info.data;
    const reserveX = raw.readBigUInt64LE(72);
    const reserveY = raw.readBigUInt64LE(80);

    return mint === WRAPPED_SOL ? reserveX : reserveY;
  } catch {
    return 0n;
  }
}

/**
 * Compute weighted token quality score
 */
export async function computeTokenScore(mint, liquiditySOL) {
  const score = {
    liquidity: 0,
    holders: 0,
    activity: 0,
    risk: 0,
    total: 0
  };

  // Liquidity component
  if (liquiditySOL > 100n * LAMPORTS_PER_SOL) score.liquidity += 30;
  else if (liquiditySOL > 10n * LAMPORTS_PER_SOL) score.liquidity += 20;
  else if (liquiditySOL > 1n * LAMPORTS_PER_SOL) score.liquidity += 10;

  // Holder distribution
  try {
    const topHolders = await connection.getTokenLargestAccounts(mint);
    if (topHolders?.value) {
      const accounts = topHolders.value;
      const totalTop = accounts.reduce((tot, acc) => tot + BigInt(acc.amount), 0n);

      const dominantPercent =
        totalTop === 0n
          ? 0
          : Number((accounts[0].amount * 100n) / totalTop);

      if (dominantPercent < 40) score.holders += 25;
      else if (dominantPercent < 60) score.holders += 15;
      else score.holders += 5;
    }
  } catch {}

  // Activity proxy
  const activity = await fetchRecentTradesForMint(mint);
  if (activity.uniqueTraders > 10) score.activity += 15;
  if (activity.totalVolume > 5n * LAMPORTS_PER_SOL) score.activity += 15;

  // Risk flags
  const riskFlags = await detectRiskFlags(mint);
  score.risk += riskFlags * 10;

  // Composite
  score.total =
    score.liquidity +
    score.holders +
    score.activity -
    score.risk;

  // Clamp minimum
  if (score.total < 0) score.total = 0;

  return score;
}

/**
 * Fetch recent trading signals as a naive proxy
 * — counts unique signers and total SOL movement
 */
async function fetchRecentTradesForMint(mint) {
  try {
    const sigs = await connection.getSignaturesForAddress(mint, { limit: 30 });
    const unique = new Set();
    let totalVol = 0n;

    for (const s of sigs) {
      const tx = await connection.getTransaction(s.signature);
      if (!tx) continue;

      tx.transaction.message.accountKeys.forEach((k) => {
        unique.add(k.toBase58());
      });

      tx.meta.postBalances.forEach((bal, i) => {
        const pre = tx.meta.preBalances[i];
        if (bal > pre) totalVol += BigInt(bal - pre);
      });
    }

    return {
      uniqueTraders: unique.size,
      totalVolume: totalVol
    };
  } catch {
    return { uniqueTraders: 0, totalVolume: 0n };
  }
}

/**
 * Basic risk probe — detect honeypot sell failure
 */
async function detectRiskFlags(mint) {
  let flags = 0;

  try {
    const canSell = await testSell(mint, 0.001);
    if (!canSell) flags++;
  } catch {
    flags++;
  }

  return flags;
}

/**
 * Execute buy
 */
async function executeBuy({ mint, pool, platform, amount = 0.1 }) {
  try {
    await swap({
      inputMint: WRAPPED_SOL,
      outputMint: mint,
      amount,
      slippage: 1.5
    });
    logger.info(`✅ Bought ${amount} SOL of ${mint} on ${platform}`);
  } catch (e) {
    logger.error(e, `❌ Buy failed for ${mint}`);
  }
}

/**
 * Placeholder for testSell logic — implement your own RPC sell probe
 */
async function testSell(mint, amount) {
  // throw if sell fails or returns false
  return true;
}